## B: woodshed and well approved, fresh store, default steward, no hand roles (ticks after approval; never = not within 1800)
| run | seed | at | woodshed before | after | well before | after | woodshed+well change |
|---|---|---|---|---|---|---|---|
| v7 fresh | 1337 | 0 | 78 | 57 | 125 | 83 | -31 % |
| v7 fresh | 1337 | 120 | 215 | 184 | 285 | 222 | -19 % |
| v7 fresh | 1337 | 400 | 205 | 58 | 214 | 202 | -38 % |
| v7 fresh | 42 | 0 | 51 | 41 | 92 | 74 | -20 % |
| v7 fresh | 42 | 120 | 188 | 40 | 262 | 185 | -50 % |
| v7 fresh | 42 | 400 | 203 | 60 | 212 | 202 | -37 % |
| v7 fresh | 7 | 0 | 93 | 70 | 186 | 122 | -31 % |
| v7 fresh | 7 | 120 | 248 | 184 | 276 | 233 | -20 % |
| v7 fresh | 7 | 400 | 214 | 202 | 218 | 211 | -4 % |
| v6->v7 | 1337 | 0 | 150 | 77 | 172 | 136 | -34 % |
| v6->v7 | 1337 | 120 | 272 | 182 | 296 | 237 | -26 % |
| v6->v7 | 1337 | 400 | 214 | 84 | 234 | 226 | -31 % |
| v6->v7 | 42 | 0 | 89 | 67 | 103 | 98 | -14 % |
| v6->v7 | 42 | 120 | 183 | 53 | 220 | 199 | -37 % |
| v6->v7 | 42 | 400 | 210 | 47 | 235 | 72 | -73 % |
| v6->v7 | 7 | 0 | 150 | 138 | 170 | 153 | -9 % |
| v6->v7 | 7 | 120 | 233 | 182 | 226 | 199 | -17 % |
| v6->v7 | 7 | 400 | 228 | 69 | 236 | 209 | -40 % |

## F: 6 x 6 owner field on a farm with n 4 x 4 fields (300 ticks warm); ticks after marking
| run | seed | fields | taken before | after | sown before | after | free seed / units | units sown by +60 before | after | taken+sown change |
|---|---|---|---|---|---|---|---|---|---|---|
| v7 fresh | 1337 | 2 | 1 | 1 | 57 | 30 | 6 / 4 | 4 | 4 | -47 % |
| v7 fresh | 1337 | 4 | 1 | 1 | 46 | 37 | 5 / 4 | 4 | 4 | -19 % |
| v7 fresh | 1337 | 6 | 1 | 1 | 154 | 28 | 6 / 4 | 2 | 4 | -81 % |
| v7 fresh | 42 | 2 | 1 | 1 | 46 | 55 | 6 / 4 | 4 | 4 | 19 % |
| v7 fresh | 42 | 4 | 1 | 1 | 73 | 34 | 11 / 4 | 1 | 4 | -53 % |
| v7 fresh | 42 | 6 | 3 | 1 | 77 | 31 | 4 / 4 | 0 | 4 | -60 % |
| v7 fresh | 7 | 2 | 1 | 1 | 50 | 31 | 6 / 4 | 4 | 4 | -37 % |
| v7 fresh | 7 | 4 | 1 | 1 | 38 | 27 | 4 / 4 | 4 | 4 | -28 % |
| v7 fresh | 7 | 6 | 1 | 1 | 112 | 34 | 8 / 4 | 2 | 4 | -69 % |
| v6->v7 | 1337 | 2 | 10 | 5 | 77 | 54 | 2 / 4 | 2 | 4 | -32 % |
| v6->v7 | 1337 | 4 | 1 | 7 | 110 | 59 | 1 / 4 | 1 | 4 | -41 % |
| v6->v7 | 1337 | 6 | 56 | 6 | 376 | 78 | 2 / 4 | 0 | 2 | -81 % |
| v6->v7 | 42 | 2 | 8 | 1 | 81 | 59 | 2 / 4 | 2 | 4 | -33 % |
| v6->v7 | 42 | 4 | 1 | 6 | 84 | 43 | 5 / 4 | 1 | 4 | -42 % |
| v6->v7 | 42 | 6 | 50 | 1 | 344 | 69 | 0 / 4 | 0 | 3 | -82 % |
| v6->v7 | 7 | 2 | 1 | 1 | 80 | 57 | 2 / 4 | 2 | 4 | -28 % |
| v6->v7 | 7 | 4 | 12 | 4 | 102 | 51 | 0 / 4 | 0 | 4 | -52 % |
| v6->v7 | 7 | 6 | 1 | 4 | 92 | 72 | 2 / 4 | 2 | 2 | -18 % |

## W: max wait of routine and upkeep work (daytime ticks, due to taken), 600 ticks after the owner field; bound 120
| run | seed | fields | before | after | open at end (after) | after: waits > 100 |
|---|---|---|---|---|---|---|
| v7 fresh | 1337 | 2 | 77 | 52 | product:animal:007 10 | - |
| v7 fresh | 1337 | 4 | 93 | 80 | product:animal:007 10 | - |
| v7 fresh | 1337 | 6 | 110 | 80 | sow:field:16 57 | - |
| v7 fresh | 42 | 2 | 66 | 65 | product:animal:007 22 | - |
| v7 fresh | 42 | 4 | 106 | 84 | product:animal:007 10 | - |
| v7 fresh | 42 | 6 | 78 | 76 | water:field:15 53 | - |
| v7 fresh | 7 | 2 | 86 | 58 | product:animal:007 23 | - |
| v7 fresh | 7 | 4 | 95 | 58 | harvest:field:15 22 | - |
| v7 fresh | 7 | 6 | 121 | 80 | harvest:field:15 45 | - |
| v6->v7 | 1337 | 2 | 91 | 70 | harvest:field:25 23 | - |
| v6->v7 | 1337 | 4 | 139 | 89 | product:animal:006 43 | - |
| v6->v7 | 1337 | 6 | 155 | 99 | product:animal:027 47 | - |
| v6->v7 | 42 | 2 | 95 | 68 | eggs:coop 12 | - |
| v6->v7 | 42 | 4 | 125 | 85 | product:animal:005 44 | - |
| v6->v7 | 42 | 6 | 149 | 112 | harvest:field:21 33 | product:animal:007@262->403:112, product:animal:011@299->403:104 |
| v6->v7 | 7 | 2 | 85 | 67 | product:animal:007 17 | - |
| v6->v7 | 7 | 4 | 94 | 75 | water:field:17 26 | - |
| v6->v7 | 7 | 6 | 132 | 95 | harvest:field:17 51 | - |

## T: standard farm (4 x 4 owner field, 1500 ticks)
| seed | max wait before | after | travel share before | after | work share of awake before | after |
|---|---|---|---|---|---|---|
| 1337 | 57 | 45 | 23 % | 19 % | 7.6 % | 10.1 % |
| 42 | 62 | 45 | 25 % | 19 % | 9.0 % | 11.1 % |
| 7 | 53 | 45 | 25 % | 19 % | 9.1 % | 10.4 % |

## Totals
- Total task time (sum over every B and F run of woodshed + well ticks and owner-field taken + sown ticks; never counted as the run limit): before 9136, after 5751, change -37 %.
- Errand time (every finished villager task other than idle, eat, rest, over all B, F, W and T runs): before 2973 tasks, 49865 ticks, mean 16.77; after 3116 tasks, 42849 ticks, mean 13.75 (-18 % per task).
- Largest villager step in one tick, all after runs: 1.0000 of the exact allowance (speed x 1 tick).
- Bound failures after: none
