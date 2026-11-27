//! TEST ONLY mock of the MagicBlock VRF program, deployed locally at the VRF program id.
//! - Request (data[0] in {3, 10} after the SDK's 8-byte discriminator): appends the borsh
//!   RequestRandomness payload to the queue account (accounts[2]), like the real queue.
//! - Fulfil (data[0] == 200, u32 item, [u8;32] randomness): rebuilds the callback exactly as
//!   ephemeral-vrf/program/src/provide_randomness.rs does (identity signer first, then the
//!   request's metas; data = disc || randomness || callback_args) and invoke_signed's it with
//!   the scoped identity PDA [b"identity", callback_program] under this program id.
//! - Fulfil-raw (data[0] == 201, u32 item, [u8;32] randomness, u32 n, n bytes): same but with
//!   caller-supplied callback_args (to simulate a forged / mismatched ticket from the VRF identity).
//! No proof, no oracle: randomness is whatever the test supplies.
use solana_program::{
    account_info::AccountInfo, entrypoint, entrypoint::ProgramResult, instruction::{AccountMeta, Instruction},
    program::invoke_signed, program_error::ProgramError, pubkey::Pubkey,
};

entrypoint!(process);

fn rd_u32(d: &[u8], o: &mut usize) -> Result<u32, ProgramError> {
    let v = u32::from_le_bytes(d.get(*o..*o + 4).ok_or(ProgramError::InvalidInstructionData)?.try_into().unwrap());
    *o += 4;
    Ok(v)
}

struct Req { program: Pubkey, disc: Vec<u8>, metas: Vec<AccountMeta>, args: Vec<u8> }

fn parse(d: &[u8]) -> Result<Req, ProgramError> {
    let mut o = 32; // caller_seed
    let program = Pubkey::new_from_array(d.get(o..o + 32).ok_or(ProgramError::InvalidAccountData)?.try_into().unwrap());
    o += 32;
    let n = rd_u32(d, &mut o)? as usize;
    let disc = d[o..o + n].to_vec();
    o += n;
    let m = rd_u32(d, &mut o)? as usize;
    let mut metas = Vec::with_capacity(m);
    for _ in 0..m {
        let k = Pubkey::new_from_array(d[o..o + 32].try_into().unwrap());
        let (signer, writable) = (d[o + 32] != 0, d[o + 33] != 0);
        o += 34;
        metas.push(if writable { AccountMeta::new(k, signer) } else { AccountMeta::new_readonly(k, signer) });
    }
    let a = rd_u32(d, &mut o)? as usize;
    let args = d[o..o + a].to_vec();
    Ok(Req { program, disc, metas, args })
}

fn item(queue: &[u8], idx: u32) -> Result<Vec<u8>, ProgramError> {
    let mut o = 0;
    let n = rd_u32(queue, &mut o)?;
    if idx >= n { return Err(ProgramError::InvalidArgument); }
    for i in 0..n {
        let len = rd_u32(queue, &mut o)? as usize;
        if i == idx { return Ok(queue[o..o + len].to_vec()); }
        o += len;
    }
    Err(ProgramError::InvalidArgument)
}

pub fn process(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    match data.first() {
        Some(3) | Some(10) | Some(11) | Some(12) => {
            // accounts: payer, program_identity (signer), queue, system, slot_hashes
            if !accounts[1].is_signer { return Err(ProgramError::MissingRequiredSignature); }
            let payload = &data[8..];
            let mut q = accounts[2].try_borrow_mut_data()?;
            let mut o = 0;
            let n = rd_u32(&q, &mut o)?;
            for _ in 0..n { let len = rd_u32(&q, &mut o)? as usize; o += len; }
            q[o..o + 4].copy_from_slice(&(payload.len() as u32).to_le_bytes());
            q[o + 4..o + 4 + payload.len()].copy_from_slice(payload);
            q[0..4].copy_from_slice(&(n + 1).to_le_bytes());
            Ok(())
        }
        Some(200) | Some(201) => {
            // accounts: identity PDA, callback program, queue, ...callback accounts
            let idx = u32::from_le_bytes(data[1..5].try_into().unwrap());
            let rnd: [u8; 32] = data[5..37].try_into().unwrap();
            let raw = item(&accounts[2].try_borrow_data()?, idx)?;
            let req = parse(&raw)?;
            let args = if data[0] == 201 {
                let n = u32::from_le_bytes(data[37..41].try_into().unwrap()) as usize;
                data[41..41 + n].to_vec()
            } else { req.args.clone() };
            let (pda, bump) = Pubkey::find_program_address(&[b"identity", req.program.as_ref()], program_id);
            if *accounts[0].key != pda { return Err(ProgramError::InvalidSeeds); }
            let mut metas = vec![AccountMeta::new_readonly(pda, true)];
            metas.extend(req.metas.iter().cloned());
            let mut cb = req.disc.clone();
            cb.extend_from_slice(&rnd);
            cb.extend_from_slice(&args);
            let ix = Instruction { program_id: req.program, accounts: metas, data: cb };
            let mut infos = vec![accounts[1].clone(), accounts[0].clone()];
            infos.extend_from_slice(&accounts[3..]);
            invoke_signed(&ix, &infos, &[&[b"identity", req.program.as_ref(), &[bump]]])
        }
        _ => Err(ProgramError::InvalidInstructionData),
    }
}
