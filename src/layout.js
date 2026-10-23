// The lounge as DATA. Everything in the room comes from here, so a level editor, a save file or a server
// can replace it without touching rendering or simulation. Future "decorate your lounge" = edit this list.
export const LOUNGE = {
  id: 'lounge-1', name: 'Neon Arcade Lounge', w: 26, h: 18,
  spawn: { x: 13, y: 16 },
  props: [
    { id: 'rug1', type: 'rug', x: 11, y: 9, r: 0, color: '#5b2a86' },
    // arcade wall (north)
    ...[2, 3, 4, 5, 6, 7].map((x, i) => ({ id: 'cab' + i, type: 'cabinet', x, y: 1, r: 0, game: i === 0 ? 'ludo' : i === 5 ? 'proto89' : null, color: ['#ff4d6d', '#35e0c9', '#ffd166', '#7a6bff', '#ff8a3d', '#33ff88'][i] })),
    { id: 'claw1', type: 'claw', x: 9, y: 1, r: 0, color: '#ff6fb5' },
    { id: 'claw2', type: 'claw', x: 10, y: 1, r: 0, color: '#6fe08a' },
    { id: 'juke', type: 'jukebox', x: 13, y: 1, r: 0, color: '#ffb84a' },
    // west wall: more cabinets facing east + wardrobe mirror
    ...[4, 5, 6].map((y, i) => ({ id: 'cabw' + i, type: 'cabinet', x: 1, y, r: 3, game: null, color: ['#4dd0ff', '#ff4d6d', '#ffd166'][i] })),
    { id: 'mirror1', type: 'mirror', x: 1, y: 10, r: 3, color: '#ffb84a' },
    // ludo corner + pool
    { id: 'ludo1', type: 'ludotable', x: 19, y: 3, r: 0, game: 'ludo', color: '#2f6b4a' },
    { id: 'pool1', type: 'pool', x: 16, y: 9, r: 0, game: 'pool', color: '#1f6f4f' },
    { id: 'pool2', type: 'pool', x: 16, y: 13, r: 0, game: 'pool', color: '#1f6f4f' },
    // bar (east wall) + stools
    { id: 'bar1', type: 'bar', x: 22, y: 6, r: 1, color: '#5a3a24' },
    ...[6, 7, 8, 9, 10].map(y => ({ id: 'st' + y, type: 'stool', x: 21, y, r: 3, color: '#c0392b' })),
    // lounge seating around the rug
    { id: 'couch1', type: 'couch', x: 10, y: 8, r: 2, color: '#d1495b' },
    { id: 'couch2', type: 'couch', x: 10, y: 13, r: 0, color: '#2e86ab' },
    { id: 'table1', type: 'table', x: 12, y: 11, r: 0, color: '#2d2438' },
    { id: 'plant1', type: 'plant', x: 1, y: 15, r: 0 }, { id: 'plant2', type: 'plant', x: 24, y: 15, r: 0 },
    { id: 'plant3', type: 'plant', x: 24, y: 1, r: 0 }, { id: 'plant4', type: 'plant', x: 15, y: 1, r: 0 },
    { id: 'portal1', type: 'portal', x: 24, y: 3, r: 3, color: '#8a5cff' },
    { id: 'loft_diorama', type: 'diorama_table', x: 23, y: 13, r: 3, color: '#38ada9' },
    { id: 'neon1', type: 'neon', side: 'n', x: 5.5, y: 0, r: 0, text: 'ARCADE', color: '#ff4d9a' },
    { id: 'neon2', type: 'neon', side: 'n', x: 18.5, y: 0, r: 0, text: 'LOUNGE', color: '#35e0ff' },
    { id: 'vend1', type: 'vending', x: 16, y: 1, r: 0, color: '#e0493a' },
    { id: 'vend2', type: 'vending', x: 17, y: 1, r: 0, color: '#3a74e0' },
    // wall decor (side: n = north wall at x, w = west wall at y)
    ...[[11.5, 0], [15.5, 1], [22.5, 2], [24.5, 3]].map(([x, s]) => ({ id: 'pn' + x, type: 'poster', side: 'n', x, y: 0, r: 0, style: s })),
    ...[[8, 4], [10.5, 5], [13, 6], [15.5, 7]].map(([y, s]) => ({ id: 'pw' + y, type: 'poster', side: 'w', x: 0, y, r: 0, style: s })),
    ...[8.5, 12, 14, 20.5, 23.5].map(x => ({ id: 'sn' + x, type: 'sconce', side: 'n', x, y: 0, r: 0, color: '#ffb84a' })),
    ...[9, 12, 14].map(y => ({ id: 'sw' + y, type: 'sconce', side: 'w', x: 0, y, r: 0, color: '#8a5cff' })),
  ],
};

export const LOFT = {
  id: 'loft-1', name: 'Skyline Micro-Loft 101', w: 20, h: 16,
  spawn: { x: 10, y: 11 },
  props: [
    // Bedroom & Workstation Area (North wall)
    { id: 'loft_bed1', type: 'bed', x: 2, y: 1, r: 0, color: '#4a69bd' },
    { id: 'loft_mirror', type: 'mirror', x: 5, y: 1, r: 0, color: '#ffb84a' },
    { id: 'loft_ward1', type: 'wardrobe', x: 7, y: 1, r: 0, color: '#3c6382' },
    { id: 'loft_desk1', type: 'desk', x: 9, y: 1, r: 0, color: '#1e272e' },
    { id: 'loft_diorama', type: 'diorama_table', x: 13, y: 1, r: 0, color: '#38ada9' },
    { id: 'loft_plant3', type: 'plant', x: 18, y: 1, r: 0 },
    // Lounge Seating & Rug (West area)
    { id: 'loft_couch1', type: 'couch', x: 2, y: 7, r: 2, color: '#eb2f06' },
    { id: 'loft_rug1', type: 'rug', x: 2, y: 8, r: 0, color: '#6a89cc' },
    { id: 'loft_table1', type: 'table', x: 3, y: 9, r: 0, color: '#2d2438' },
    // Kitchenette Breakfast Bar (East area)
    { id: 'loft_bar', type: 'bar', x: 14, y: 7, r: 1, color: '#5a3a24' },
    { id: 'loft_st1', type: 'stool', x: 13, y: 8, r: 3, color: '#c0392b' },
    { id: 'loft_st2', type: 'stool', x: 13, y: 10, r: 3, color: '#c0392b' },
    // Elevator Portal to Arcade Lounge
    { id: 'loft_elevator', type: 'portal', x: 18, y: 7, r: 3, color: '#ff4d9a' },
    // Modern floor plants
    { id: 'loft_plant1', type: 'plant', x: 1, y: 13, r: 0 },
    { id: 'loft_plant2', type: 'plant', x: 18, y: 13, r: 0 },
    // Wall decor & neon signs
    { id: 'loft_neon1', type: 'neon', side: 'n', x: 8, y: 0, r: 0, text: 'UNIT 101', color: '#8a5cff' },
    { id: 'loft_neon2', type: 'neon', side: 'n', x: 15, y: 0, r: 0, text: 'SKYLINE LOFT', color: '#35e0ff' },
    { id: 'loft_sn1', type: 'sconce', side: 'n', x: 4, y: 0, r: 0, color: '#ffb84a' },
    { id: 'loft_sn2', type: 'sconce', side: 'n', x: 12, y: 0, r: 0, color: '#35e0ff' },
    { id: 'loft_sw1', type: 'sconce', side: 'w', x: 0, y: 5, r: 0, color: '#ffb84a' },
    { id: 'loft_sw2', type: 'sconce', side: 'w', x: 0, y: 11, r: 0, color: '#8a5cff' },
    { id: 'loft_pn1', type: 'poster', side: 'n', x: 1, y: 0, r: 0, style: 0 },
    { id: 'loft_pw1', type: 'poster', side: 'w', x: 0, y: 2, r: 0, style: 2 }
  ]
};

