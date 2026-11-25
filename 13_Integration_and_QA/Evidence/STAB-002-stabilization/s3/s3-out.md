## B: woodshed + well approved, fresh store, steward default, no owner help (ticks after approval; null = not within 1800)
| rules | seed | approved at | woodshed done | well done | steward moves |
|---|---|---|---|---|---|
| v6 fresh | 1337 | 0 | 651 | 775 | t15 Cora->builder, t315 Ada->woodcutter |
| v6 fresh | 1337 | 120 | never | never | t105 Ada->herder, t405 Cora->builder |
| v6 fresh | 1337 | 400 | never | never | t105 Ada->herder, t405 Cora->builder |
| v6 fresh | 42 | 0 | 651 | 743 | t15 Cora->builder, t315 Ada->woodcutter |
| v6 fresh | 42 | 120 | never | never | t105 Ada->herder, t405 Cora->builder |
| v6 fresh | 42 | 400 | never | never | t105 Ada->herder, t405 Cora->builder |
| v6 fresh | 7 | 0 | 652 | 752 | t15 Cora->builder, t315 Ada->woodcutter |
| v6 fresh | 7 | 120 | never | never | t105 Ada->herder, t405 Cora->builder |
| v6 fresh | 7 | 400 | never | never | t105 Ada->herder, t405 Cora->builder |
| v7 fresh | 1337 | 0 | 78 | 125 | t15 Cora->builder, t75 Ada->woodcutter |
| v7 fresh | 1337 | 120 | 215 | 285 | t135 Cora->builder, t195 Ada->woodcutter, t405 Cora->farmer |
| v7 fresh | 1337 | 400 | 205 | 214 | t405 Cora->builder, t465 Ada->woodcutter |
| v7 fresh | 42 | 0 | 51 | 92 | t15 Cora->builder |
| v7 fresh | 42 | 120 | 188 | 262 | t135 Cora->builder, t195 Ada->woodcutter |
| v7 fresh | 42 | 400 | 203 | 212 | t405 Cora->builder, t465 Ada->woodcutter |
| v7 fresh | 7 | 0 | 93 | 186 | t15 Cora->builder, t75 Ada->woodcutter |
| v7 fresh | 7 | 120 | 248 | 276 | t135 Cora->builder, t195 Ada->woodcutter |
| v7 fresh | 7 | 400 | 214 | 218 | t405 Cora->builder, t465 Ada->woodcutter |
| v6->v7 (300 ticks of v6) | 1337 | 0 | 150 | 172 | t105 Ada->herder, t315 Bram->builder, t375 Cora->woodcutter |
| v6->v7 (300 ticks of v6) | 1337 | 120 | 272 | 296 | t105 Ada->herder, t435 Bram->builder, t495 Cora->woodcutter |
| v6->v7 (300 ticks of v6) | 42 | 0 | 89 | 103 | t105 Ada->herder, t315 Bram->builder, t375 Cora->woodcutter |
| v6->v7 (300 ticks of v6) | 42 | 120 | 183 | 220 | t105 Ada->herder, t435 Bram->builder, t495 Cora->woodcutter |
| v6->v7 (300 ticks of v6) | 7 | 0 | 150 | 170 | t105 Ada->herder, t315 Bram->builder, t375 Cora->woodcutter |
| v6->v7 (300 ticks of v6) | 7 | 120 | 233 | 226 | t105 Ada->herder, t435 Bram->builder, t495 Cora->woodcutter |

## F: busy farm (n 4x4 fields marked at tick 0, 300 ticks played), then a 6x6 owner field; ticks after marking
| rules | seed | fields | first claimed | fully sown | free seed at marking | units sown by +60 | max routine wait (to sown) |
|---|---|---|---|---|---|---|---|
| v6 fresh | 1337 | 2 | never | never | 10 | 0/4 | 161 |
| v6 fresh | 1337 | 4 | never | never | 9 | 0/4 | 178 |
| v6 fresh | 1337 | 6 | never | never | 5 | 0/4 | 165 |
| v6 fresh | 42 | 2 | 100 | 799 | 8 | 0/4 | 398 |
| v6 fresh | 42 | 4 | never | never | 11 | 0/4 | 215 |
| v6 fresh | 42 | 6 | never | never | 11 | 0/4 | 158 |
| v6 fresh | 7 | 2 | 105 | 791 | 8 | 0/4 | 385 |
| v6 fresh | 7 | 4 | 404 | 717 | 6 | 0/4 | 338 |
| v6 fresh | 7 | 6 | never | never | 8 | 0/4 | 159 |
| v7 fresh | 1337 | 2 | 1 | 57 | 10 | 4/4 | 77 |
| v7 fresh | 1337 | 4 | 1 | 46 | 5 | 4/4 | 46 |
| v7 fresh | 1337 | 6 | 1 | 154 | 2 | 2/4 | 106 |
| v7 fresh | 42 | 2 | 1 | 46 | 8 | 4/4 | 48 |
| v7 fresh | 42 | 4 | 1 | 73 | 1 | 1/4 | 77 |
| v7 fresh | 42 | 6 | 3 | 77 | 0 | 0/4 | 75 |
| v7 fresh | 7 | 2 | 1 | 50 | 6 | 4/4 | 45 |
| v7 fresh | 7 | 4 | 1 | 38 | 8 | 4/4 | 45 |
| v7 fresh | 7 | 6 | 1 | 112 | 2 | 2/4 | 121 |
| v6->v7 | 1337 | 2 | 10 | 77 | 2 | 2/4 | 91 |
| v6->v7 | 1337 | 4 | 1 | 110 | 1 | 1/4 | 139 |
| v6->v7 | 42 | 2 | 8 | 81 | 2 | 2/4 | 84 |
| v6->v7 | 42 | 4 | 1 | 84 | 1 | 1/4 | 125 |
| v6->v7 | 7 | 2 | 1 | 80 | 2 | 2/4 | 85 |
| v6->v7 | 7 | 4 | 12 | 102 | 0 | 0/4 | 94 |

## W: routine and upkeep waits (daytime ticks from due to taken), busy farms played 600 ticks after the owner field
| rules | seed | fields | pieces of work | max wait | by kind (max) | longest still open |
|---|---|---|---|---|---|---|
| v6 fresh | 1337 | 2 | 42 | 161 | till 0, sow 90, water 39, eggs 86, harvest 35, product 161, trough 35 | till:field:19 360 |
| v6 fresh | 1337 | 4 | 52 | 178 | till 65, sow 178, water 53, eggs 74, product 80, harvest 23, trough 52 | product:animal:011 443 |
| v6 fresh | 1337 | 6 | 51 | 165 | till 64, sow 165, water 62, eggs 134, product 125, harvest 38, trough 64 | till:field:19 540 |
| v6 fresh | 42 | 2 | 48 | 162 | till 99, sow 72, water 37, product 162, harvest 36, eggs 57, trough 41 | sow:field:19 235 |
| v6 fresh | 42 | 4 | 50 | 215 | till 61, sow 116, water 73, product 215, harvest 46, eggs 39, trough 22 | till:field:24 360 |
| v6 fresh | 42 | 6 | 55 | 147 | till 61, sow 64, water 55, product 118, harvest 25, eggs 147, trough 40 | till:field:19 540 |
| v6 fresh | 7 | 2 | 45 | 177 | till 104, sow 76, water 39, product 177, harvest 34, eggs 51, trough 31 | sow:field:20 228 |
| v6 fresh | 7 | 4 | 54 | 338 | till 283, sow 56, water 43, eggs 92, harvest 27, product 338, trough 33 | product:animal:011 439 |
| v6 fresh | 7 | 6 | 56 | 144 | till 144, sow 126, water 51, product 65, harvest 46, eggs 98, trough 27 | till:field:20 540 |
| v7 fresh | 1337 | 2 | 46 | 77 | water 48, eggs 67, harvest 45, product 68, sow 77, trough 1 | product:animal:007 10 |
| v7 fresh | 1337 | 4 | 53 | 93 | water 93, eggs 29, harvest 69, product 75, sow 84, trough 38 | sow:field:15 31 |
| v7 fresh | 1337 | 6 | 49 | 110 | water 80, eggs 106, product 110, harvest 104, sow 92, trough 36 | product:animal:004 29 |
| v7 fresh | 42 | 2 | 50 | 66 | water 26, product 66, harvest 45, sow 41, eggs 48, trough 1 | sow:field:15 42 |
| v7 fresh | 42 | 4 | 52 | 106 | water 78, eggs 60, product 106, harvest 76, sow 78, trough 13 | sow:field:15 58 |
| v7 fresh | 42 | 6 | 63 | 78 | water 76, product 75, eggs 62, harvest 78, sow 75, trough 22 | sow:field:25 46 |
| v7 fresh | 7 | 2 | 42 | 86 | water 46, eggs 84, harvest 45, product 73, sow 86, trough 12 | water:field:21 27 |
| v7 fresh | 7 | 4 | 50 | 95 | water 74, eggs 86, harvest 77, product 45, sow 95, trough 1 | product:animal:004 46 |
| v7 fresh | 7 | 6 | 56 | 121 | water 60, eggs 80, product 121, harvest 86, sow 76, trough 57 | product:animal:006 49 |
| v6->v7 | 1337 | 2 | 50 | 91 | eggs 80, product 91, trough 26, water 46, harvest 47, sow 59 | product:animal:024 37 |
| v6->v7 | 1337 | 4 | 55 | 139 | eggs 93, product 139, water 106, trough 95, harvest 78, sow 108 | product:animal:025 47 |
| v6->v7 | 42 | 2 | 50 | 95 | product 83, eggs 84, water 62, trough 36, harvest 95, sow 60 | product:animal:005 41 |
| v6->v7 | 42 | 4 | 60 | 125 | product 125, eggs 95, trough 40, water 74, harvest 83, sow 73 | product:animal:005 10 |
| v6->v7 | 7 | 2 | 51 | 85 | product 85, eggs 45, water 48, trough 39, harvest 75, sow 49 | water:field:25 44 |
| v6->v7 | 7 | 4 | 58 | 94 | product 94, eggs 93, water 86, trough 75, harvest 63, sow 59 | harvest:field:20 35 |

## T: time per villager, fresh farm, 4x4 owner field at tick 0, steward default, 1500 ticks (share of all ticks)
| rules | seed | villager | travel | waiting | work | idle | eating | sleeping | starving | work share of awake ticks |
|---|---|---|---|---|---|---|---|---|---|---|
| v6 | 1337 | Ada | 38 % | 3 % | 6 % | 6 % | 13 % | 34 % | 6 % | 9 % |
| v6 | 1337 | Bram | 40 % | 3 % | 5 % | 5 % | 11 % | 35 % | 7 % | 8 % |
| v6 | 1337 | Cora | 22 % | 0 % | 5 % | 19 % | 17 % | 38 % | 7 % | 8 % |
| v6 | 1337 | all | 33 % | 2 % | 5 % | 10 % | 14 % | 35 % | 7 % | 8 % |
| v6 | 1337 | waits | max 213 over 63 pieces of work | | | | | | | |
| v6 | 42 | Ada | 41 % | 3 % | 7 % | 5 % | 10 % | 34 % | 6 % | 10 % |
| v6 | 42 | Bram | 37 % | 3 % | 6 % | 5 % | 11 % | 37 % | 7 % | 10 % |
| v6 | 42 | Cora | 22 % | 1 % | 6 % | 19 % | 15 % | 38 % | 7 % | 10 % |
| v6 | 42 | all | 33 % | 2 % | 6 % | 10 % | 12 % | 36 % | 6 % | 10 % |
| v6 | 42 | waits | max 155 over 75 pieces of work | | | | | | | |
| v6 | 7 | Ada | 39 % | 3 % | 6 % | 4 % | 9 % | 38 % | 6 % | 10 % |
| v6 | 7 | Bram | 37 % | 3 % | 6 % | 8 % | 10 % | 36 % | 7 % | 9 % |
| v6 | 7 | Cora | 22 % | 1 % | 6 % | 18 % | 15 % | 38 % | 7 % | 10 % |
| v6 | 7 | all | 33 % | 2 % | 6 % | 10 % | 12 % | 37 % | 6 % | 10 % |
| v6 | 7 | waits | max 149 over 72 pieces of work | | | | | | | |
| v7 | 1337 | Ada | 23 % | 2 % | 6 % | 21 % | 9 % | 39 % | 0 % | 9 % |
| v7 | 1337 | Bram | 23 % | 4 % | 3 % | 22 % | 10 % | 38 % | 0 % | 5 % |
| v7 | 1337 | Cora | 23 % | 2 % | 5 % | 23 % | 10 % | 37 % | 0 % | 8 % |
| v7 | 1337 | all | 23 % | 3 % | 5 % | 22 % | 10 % | 38 % | 0 % | 8 % |
| v7 | 1337 | waits | max 57 over 53 pieces of work | | | | | | | |
| v7 | 42 | Ada | 29 % | 2 % | 7 % | 21 % | 10 % | 31 % | 0 % | 10 % |
| v7 | 42 | Bram | 28 % | 3 % | 6 % | 16 % | 7 % | 39 % | 0 % | 10 % |
| v7 | 42 | Cora | 17 % | 1 % | 4 % | 34 % | 8 % | 36 % | 0 % | 7 % |
| v7 | 42 | all | 25 % | 2 % | 6 % | 24 % | 8 % | 35 % | 0 % | 9 % |
| v7 | 42 | waits | max 62 over 68 pieces of work | | | | | | | |
| v7 | 7 | Ada | 25 % | 2 % | 6 % | 21 % | 7 % | 38 % | 0 % | 10 % |
| v7 | 7 | Bram | 29 % | 3 % | 5 % | 18 % | 7 % | 39 % | 0 % | 8 % |
| v7 | 7 | Cora | 22 % | 2 % | 6 % | 25 % | 10 % | 36 % | 0 % | 9 % |
| v7 | 7 | all | 25 % | 2 % | 6 % | 21 % | 8 % | 37 % | 0 % | 9 % |
| v7 | 7 | waits | max 53 over 64 pieces of work | | | | | | | |

Largest villager step in one tick, all runs: 26.4 dm (1.015 of VILLAGER_SPEED 26 dm; 0.978 of the 27 dm allowance with integer-dm rounding)
