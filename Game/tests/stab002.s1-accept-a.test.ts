// STAB-002 S1 acceptance, part A, on the final rules (v8): fresh v8 and v2 -> v8 on 15 seeds (part B: v5 and
// v6 -> v8; part C: v7 -> v8 and the released rules v7 themselves). Criteria from STAB-001, exactly as worded
// (3 in-game days = 900 ticks measured): 0 frozen animals (observed >= 100 ticks, 0 moves, rest included);
// every animal observed >= 100 daytime ticks moves in at least 15 % of them; its longest daytime still
// stretch, rest ticks excluded, is at most 80 ticks; a reload mid-way gives the same hash and the same animals.
import { acceptance } from './stab002-accept';
acceptance('fresh v8', 8, null);
acceptance('v2 -> v8', 2, 8);
