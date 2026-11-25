// STAB-002 S1 acceptance, part A: fresh v7 and v2 -> v7 on 15 seeds (part B: v5 and v6 -> v7).
// Criteria from STAB-001 (3 in-game days = 900 ticks measured): 0 frozen animals; every animal
// moves in at least 15 % of its daytime ticks; its longest daytime still stretch, rest ticks
// excluded, is at most 80 ticks; a reload mid-way gives the same hash and the same animals.
import { acceptance } from './stab002-accept';
acceptance('fresh v7', 7, null);
acceptance('v2 -> v7', 2, 7);
