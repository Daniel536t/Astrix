// STAB-002 S1 acceptance, part B: v5 -> v7 and v6 -> v7 on 15 seeds (see part A for the criteria).
import { acceptance } from './stab002-accept';
acceptance('v5 -> v7', 5, 7);
acceptance('v6 -> v7', 6, 7);
