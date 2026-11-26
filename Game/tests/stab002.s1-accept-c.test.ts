// STAB-002 S1 acceptance, part C (criteria in part A): a v7 farm upgraded to v8 (600 ticks of v7, the journaled
// upgrade, then the window), and the released rules v7 (S3, bf23ae5) fresh, which must keep passing as S1-S3 did.
import { acceptance } from './stab002-accept';
acceptance('v7 -> v8', 7, 8);
acceptance('fresh v7 (released S3 rules)', 7, null);
