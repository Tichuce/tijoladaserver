-- Moves NPC spawns that sit on blocked (wall) tiles to the nearest free walkable tile.
-- Generated from AsperetaGoose.db and the converted map files. Review, back up the database, then apply with DB Browser (Execute SQL).
BEGIN TRANSACTION;
UPDATE npc_spawns SET map_x=87, map_y=85 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=18 AND map_id=25 AND map_x=85 AND map_y=85 LIMIT 1); -- Piglet on Boondocks: 85,85 -> 87,85
UPDATE npc_spawns SET map_x=14, map_y=6 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=24 AND map_id=25 AND map_x=14 AND map_y=7 LIMIT 1); -- Pipsqueek on Boondocks: 14,7 -> 14,6
UPDATE npc_spawns SET map_x=14, map_y=14 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=24 AND map_id=25 AND map_x=14 AND map_y=15 LIMIT 1); -- Pipsqueek on Boondocks: 14,15 -> 14,14
UPDATE npc_spawns SET map_x=25, map_y=23 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=24 AND map_id=25 AND map_x=25 AND map_y=25 LIMIT 1); -- Pipsqueek on Boondocks: 25,25 -> 25,23
UPDATE npc_spawns SET map_x=57, map_y=92 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=34 AND map_id=11 AND map_x=56 AND map_y=94 LIMIT 1); -- Weak Persecution on Otherlands: 56,94 -> 57,92
UPDATE npc_spawns SET map_x=60, map_y=94 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=34 AND map_id=11 AND map_x=59 AND map_y=94 LIMIT 1); -- Weak Persecution on Otherlands: 59,94 -> 60,94
UPDATE npc_spawns SET map_x=44, map_y=4 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=39 AND map_id=12 AND map_x=45 AND map_y=4 LIMIT 1); -- Persecution on Mindless Mines: 45,4 -> 44,4
UPDATE npc_spawns SET map_x=55, map_y=7 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=39 AND map_id=12 AND map_x=55 AND map_y=4 LIMIT 1); -- Persecution on Mindless Mines: 55,4 -> 55,7
UPDATE npc_spawns SET map_x=67, map_y=4 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=39 AND map_id=12 AND map_x=65 AND map_y=4 LIMIT 1); -- Persecution on Mindless Mines: 65,4 -> 67,4
UPDATE npc_spawns SET map_x=33, map_y=10 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=39 AND map_id=12 AND map_x=30 AND map_y=10 LIMIT 1); -- Persecution on Mindless Mines: 30,10 -> 33,10
UPDATE npc_spawns SET map_x=51, map_y=10 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=39 AND map_id=12 AND map_x=50 AND map_y=10 LIMIT 1); -- Persecution on Mindless Mines: 50,10 -> 51,10
UPDATE npc_spawns SET map_x=90, map_y=8 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=39 AND map_id=12 AND map_x=90 AND map_y=10 LIMIT 1); -- Persecution on Mindless Mines: 90,10 -> 90,8
UPDATE npc_spawns SET map_x=44, map_y=14 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=39 AND map_id=12 AND map_x=45 AND map_y=14 LIMIT 1); -- Persecution on Mindless Mines: 45,14 -> 44,14
UPDATE npc_spawns SET map_x=55, map_y=11 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=39 AND map_id=12 AND map_x=55 AND map_y=14 LIMIT 1); -- Persecution on Mindless Mines: 55,14 -> 55,11
UPDATE npc_spawns SET map_x=90, map_y=17 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=39 AND map_id=12 AND map_x=92 AND map_y=14 LIMIT 1); -- Persecution on Mindless Mines: 92,14 -> 90,17
UPDATE npc_spawns SET map_x=50, map_y=23 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=39 AND map_id=12 AND map_x=50 AND map_y=20 LIMIT 1); -- Persecution on Mindless Mines: 50,20 -> 50,23
UPDATE npc_spawns SET map_x=46, map_y=34 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=39 AND map_id=12 AND map_x=45 AND map_y=34 LIMIT 1); -- Persecution on Mindless Mines: 45,34 -> 46,34
UPDATE npc_spawns SET map_x=39, map_y=40 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=39 AND map_id=12 AND map_x=40 AND map_y=40 LIMIT 1); -- Persecution on Mindless Mines: 40,40 -> 39,40
UPDATE npc_spawns SET map_x=80, map_y=43 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=39 AND map_id=12 AND map_x=80 AND map_y=40 LIMIT 1); -- Persecution on Mindless Mines: 80,40 -> 80,43
UPDATE npc_spawns SET map_x=91, map_y=50 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=39 AND map_id=12 AND map_x=92 AND map_y=50 LIMIT 1); -- Persecution on Mindless Mines: 92,50 -> 91,50
UPDATE npc_spawns SET map_x=61, map_y=60 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=39 AND map_id=12 AND map_x=60 AND map_y=60 LIMIT 1); -- Persecution on Mindless Mines: 60,60 -> 61,60
UPDATE npc_spawns SET map_x=80, map_y=63 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=39 AND map_id=12 AND map_x=80 AND map_y=60 LIMIT 1); -- Persecution on Mindless Mines: 80,60 -> 80,63
UPDATE npc_spawns SET map_x=29, map_y=68 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=39 AND map_id=12 AND map_x=30 AND map_y=68 LIMIT 1); -- Persecution on Mindless Mines: 30,68 -> 29,68
UPDATE npc_spawns SET map_x=65, map_y=86 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=39 AND map_id=12 AND map_x=65 AND map_y=88 LIMIT 1); -- Persecution on Mindless Mines: 65,88 -> 65,86
UPDATE npc_spawns SET map_x=17, map_y=96 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=39 AND map_id=12 AND map_x=20 AND map_y=96 LIMIT 1); -- Persecution on Mindless Mines: 20,96 -> 17,96
UPDATE npc_spawns SET map_x=33, map_y=4 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=49 AND map_id=12 AND map_x=30 AND map_y=4 LIMIT 1); -- Strong Persecution on Mindless Mines: 30,4 -> 33,4
UPDATE npc_spawns SET map_x=51, map_y=7 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=49 AND map_id=12 AND map_x=50 AND map_y=4 LIMIT 1); -- Strong Persecution on Mindless Mines: 50,4 -> 51,7
UPDATE npc_spawns SET map_x=60, map_y=7 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=49 AND map_id=12 AND map_x=60 AND map_y=4 LIMIT 1); -- Strong Persecution on Mindless Mines: 60,4 -> 60,7
UPDATE npc_spawns SET map_x=44, map_y=10 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=49 AND map_id=12 AND map_x=45 AND map_y=10 LIMIT 1); -- Strong Persecution on Mindless Mines: 45,10 -> 44,10
UPDATE npc_spawns SET map_x=85, map_y=8 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=49 AND map_id=12 AND map_x=85 AND map_y=10 LIMIT 1); -- Strong Persecution on Mindless Mines: 85,10 -> 85,8
UPDATE npc_spawns SET map_x=92, map_y=8 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=49 AND map_id=12 AND map_x=92 AND map_y=10 LIMIT 1); -- Strong Persecution on Mindless Mines: 92,10 -> 92,8
UPDATE npc_spawns SET map_x=51, map_y=11 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=49 AND map_id=12 AND map_x=50 AND map_y=14 LIMIT 1); -- Strong Persecution on Mindless Mines: 50,14 -> 51,11
UPDATE npc_spawns SET map_x=87, map_y=14 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=49 AND map_id=12 AND map_x=90 AND map_y=14 LIMIT 1); -- Strong Persecution on Mindless Mines: 90,14 -> 87,14
UPDATE npc_spawns SET map_x=44, map_y=20 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=49 AND map_id=12 AND map_x=45 AND map_y=20 LIMIT 1); -- Strong Persecution on Mindless Mines: 45,20 -> 44,20
UPDATE npc_spawns SET map_x=55, map_y=23 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=49 AND map_id=12 AND map_x=55 AND map_y=20 LIMIT 1); -- Strong Persecution on Mindless Mines: 55,20 -> 55,23
UPDATE npc_spawns SET map_x=46, map_y=40 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=49 AND map_id=12 AND map_x=45 AND map_y=40 LIMIT 1); -- Strong Persecution on Mindless Mines: 45,40 -> 46,40
UPDATE npc_spawns SET map_x=54, map_y=40 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=49 AND map_id=12 AND map_x=55 AND map_y=40 LIMIT 1); -- Strong Persecution on Mindless Mines: 55,40 -> 54,40
UPDATE npc_spawns SET map_x=89, map_y=40 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=49 AND map_id=12 AND map_x=85 AND map_y=40 LIMIT 1); -- Strong Persecution on Mindless Mines: 85,40 -> 89,40
UPDATE npc_spawns SET map_x=40, map_y=49 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=49 AND map_id=12 AND map_x=40 AND map_y=50 LIMIT 1); -- Strong Persecution on Mindless Mines: 40,50 -> 40,49
UPDATE npc_spawns SET map_x=54, map_y=60 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=49 AND map_id=12 AND map_x=55 AND map_y=60 LIMIT 1); -- Strong Persecution on Mindless Mines: 55,60 -> 54,60
UPDATE npc_spawns SET map_x=87, map_y=60 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=49 AND map_id=12 AND map_x=85 AND map_y=60 LIMIT 1); -- Strong Persecution on Mindless Mines: 85,60 -> 87,60
UPDATE npc_spawns SET map_x=41, map_y=68 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=49 AND map_id=12 AND map_x=40 AND map_y=68 LIMIT 1); -- Strong Persecution on Mindless Mines: 40,68 -> 41,68
UPDATE npc_spawns SET map_x=10, map_y=75 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=49 AND map_id=12 AND map_x=10 AND map_y=76 LIMIT 1); -- Strong Persecution on Mindless Mines: 10,76 -> 10,75
UPDATE npc_spawns SET map_x=39, map_y=88 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=49 AND map_id=12 AND map_x=40 AND map_y=88 LIMIT 1); -- Strong Persecution on Mindless Mines: 40,88 -> 39,88
UPDATE npc_spawns SET map_x=60, map_y=86 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=49 AND map_id=12 AND map_x=60 AND map_y=88 LIMIT 1); -- Strong Persecution on Mindless Mines: 60,88 -> 60,86
UPDATE npc_spawns SET map_x=28, map_y=59 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=56 AND map_id=9 AND map_x=26 AND map_y=54 LIMIT 1); -- Spook on Punchys Playhouse: 26,54 -> 28,59
UPDATE npc_spawns SET map_x=94, map_y=80 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=114 AND map_id=17 AND map_x=95 AND map_y=80 LIMIT 1); -- Melty on Northern Arctic Lands: 95,80 -> 94,80
UPDATE npc_spawns SET map_x=9, map_y=11 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=129 AND map_id=43 AND map_x=5 AND map_y=5 LIMIT 1); -- Patrol Bear on Bear Kingdom: 5,5 -> 9,11
UPDATE npc_spawns SET map_x=10, map_y=11 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=129 AND map_id=43 AND map_x=10 AND map_y=5 LIMIT 1); -- Patrol Bear on Bear Kingdom: 10,5 -> 10,11
UPDATE npc_spawns SET map_x=15, map_y=11 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=129 AND map_id=43 AND map_x=15 AND map_y=5 LIMIT 1); -- Patrol Bear on Bear Kingdom: 15,5 -> 15,11
UPDATE npc_spawns SET map_x=23, map_y=10 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=129 AND map_id=43 AND map_x=20 AND map_y=5 LIMIT 1); -- Patrol Bear on Bear Kingdom: 20,5 -> 23,10
UPDATE npc_spawns SET map_x=24, map_y=10 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=129 AND map_id=43 AND map_x=25 AND map_y=5 LIMIT 1); -- Patrol Bear on Bear Kingdom: 25,5 -> 24,10
UPDATE npc_spawns SET map_x=30, map_y=10 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=129 AND map_id=43 AND map_x=30 AND map_y=5 LIMIT 1); -- Patrol Bear on Bear Kingdom: 30,5 -> 30,10
UPDATE npc_spawns SET map_x=36, map_y=5 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=129 AND map_id=43 AND map_x=35 AND map_y=5 LIMIT 1); -- Patrol Bear on Bear Kingdom: 35,5 -> 36,5
UPDATE npc_spawns SET map_x=45, map_y=6 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=129 AND map_id=43 AND map_x=50 AND map_y=5 LIMIT 1); -- Patrol Bear on Bear Kingdom: 50,5 -> 45,6
UPDATE npc_spawns SET map_x=55, map_y=11 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=129 AND map_id=43 AND map_x=55 AND map_y=5 LIMIT 1); -- Patrol Bear on Bear Kingdom: 55,5 -> 55,11
UPDATE npc_spawns SET map_x=60, map_y=11 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=129 AND map_id=43 AND map_x=60 AND map_y=5 LIMIT 1); -- Patrol Bear on Bear Kingdom: 60,5 -> 60,11
UPDATE npc_spawns SET map_x=69, map_y=5 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=129 AND map_id=43 AND map_x=65 AND map_y=5 LIMIT 1); -- Patrol Bear on Bear Kingdom: 65,5 -> 69,5
UPDATE npc_spawns SET map_x=83, map_y=6 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=129 AND map_id=43 AND map_x=85 AND map_y=5 LIMIT 1); -- Patrol Bear on Bear Kingdom: 85,5 -> 83,6
UPDATE npc_spawns SET map_x=85, map_y=1 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=129 AND map_id=43 AND map_x=95 AND map_y=5 LIMIT 1); -- Patrol Bear on Bear Kingdom: 95,5 -> 85,1
UPDATE npc_spawns SET map_x=8, map_y=12 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=129 AND map_id=43 AND map_x=5 AND map_y=10 LIMIT 1); -- Patrol Bear on Bear Kingdom: 5,10 -> 8,12
UPDATE npc_spawns SET map_x=14, map_y=11 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=129 AND map_id=43 AND map_x=15 AND map_y=10 LIMIT 1); -- Patrol Bear on Bear Kingdom: 15,10 -> 14,11
UPDATE npc_spawns SET map_x=50, map_y=11 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=129 AND map_id=43 AND map_x=50 AND map_y=10 LIMIT 1); -- Patrol Bear on Bear Kingdom: 50,10 -> 50,11
UPDATE npc_spawns SET map_x=54, map_y=11 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=129 AND map_id=43 AND map_x=55 AND map_y=10 LIMIT 1); -- Patrol Bear on Bear Kingdom: 55,10 -> 54,11
UPDATE npc_spawns SET map_x=59, map_y=11 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=129 AND map_id=43 AND map_x=60 AND map_y=10 LIMIT 1); -- Patrol Bear on Bear Kingdom: 60,10 -> 59,11
UPDATE npc_spawns SET map_x=65, map_y=11 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=129 AND map_id=43 AND map_x=65 AND map_y=10 LIMIT 1); -- Patrol Bear on Bear Kingdom: 65,10 -> 65,11
UPDATE npc_spawns SET map_x=85, map_y=11 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=129 AND map_id=43 AND map_x=90 AND map_y=10 LIMIT 1); -- Patrol Bear on Bear Kingdom: 90,10 -> 85,11
UPDATE npc_spawns SET map_x=93, map_y=16 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=129 AND map_id=43 AND map_x=95 AND map_y=10 LIMIT 1); -- Patrol Bear on Bear Kingdom: 95,10 -> 93,16
UPDATE npc_spawns SET map_x=8, map_y=15 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=129 AND map_id=43 AND map_x=5 AND map_y=15 LIMIT 1); -- Patrol Bear on Bear Kingdom: 5,15 -> 8,15
UPDATE npc_spawns SET map_x=93, map_y=17 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=129 AND map_id=43 AND map_x=95 AND map_y=15 LIMIT 1); -- Patrol Bear on Bear Kingdom: 95,15 -> 93,17
UPDATE npc_spawns SET map_x=8, map_y=20 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=129 AND map_id=43 AND map_x=5 AND map_y=20 LIMIT 1); -- Patrol Bear on Bear Kingdom: 5,20 -> 8,20
UPDATE npc_spawns SET map_x=62, map_y=20 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=129 AND map_id=43 AND map_x=60 AND map_y=20 LIMIT 1); -- Patrol Bear on Bear Kingdom: 60,20 -> 62,20
UPDATE npc_spawns SET map_x=67, map_y=20 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=129 AND map_id=43 AND map_x=65 AND map_y=20 LIMIT 1); -- Patrol Bear on Bear Kingdom: 65,20 -> 67,20
UPDATE npc_spawns SET map_x=93, map_y=20 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=129 AND map_id=43 AND map_x=95 AND map_y=20 LIMIT 1); -- Patrol Bear on Bear Kingdom: 95,20 -> 93,20
UPDATE npc_spawns SET map_x=5, map_y=37 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=129 AND map_id=43 AND map_x=5 AND map_y=35 LIMIT 1); -- Patrol Bear on Bear Kingdom: 5,35 -> 5,37
UPDATE npc_spawns SET map_x=93, map_y=35 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=129 AND map_id=43 AND map_x=95 AND map_y=35 LIMIT 1); -- Patrol Bear on Bear Kingdom: 95,35 -> 93,35
UPDATE npc_spawns SET map_x=5, map_y=45 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=129 AND map_id=43 AND map_x=5 AND map_y=50 LIMIT 1); -- Patrol Bear on Bear Kingdom: 5,50 -> 5,45
UPDATE npc_spawns SET map_x=89, map_y=50 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=129 AND map_id=43 AND map_x=90 AND map_y=50 LIMIT 1); -- Patrol Bear on Bear Kingdom: 90,50 -> 89,50
UPDATE npc_spawns SET map_x=93, map_y=47 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=129 AND map_id=43 AND map_x=95 AND map_y=50 LIMIT 1); -- Patrol Bear on Bear Kingdom: 95,50 -> 93,47
UPDATE npc_spawns SET map_x=5, map_y=57 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=129 AND map_id=43 AND map_x=5 AND map_y=55 LIMIT 1); -- Patrol Bear on Bear Kingdom: 5,55 -> 5,57
UPDATE npc_spawns SET map_x=10, map_y=57 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=129 AND map_id=43 AND map_x=10 AND map_y=55 LIMIT 1); -- Patrol Bear on Bear Kingdom: 10,55 -> 10,57
UPDATE npc_spawns SET map_x=89, map_y=55 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=129 AND map_id=43 AND map_x=95 AND map_y=55 LIMIT 1); -- Patrol Bear on Bear Kingdom: 95,55 -> 89,55
UPDATE npc_spawns SET map_x=49, map_y=70 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=129 AND map_id=43 AND map_x=50 AND map_y=70 LIMIT 1); -- Patrol Bear on Bear Kingdom: 50,70 -> 49,70
UPDATE npc_spawns SET map_x=55, map_y=69 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=129 AND map_id=43 AND map_x=55 AND map_y=70 LIMIT 1); -- Patrol Bear on Bear Kingdom: 55,70 -> 55,69
UPDATE npc_spawns SET map_x=89, map_y=70 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=129 AND map_id=43 AND map_x=90 AND map_y=70 LIMIT 1); -- Patrol Bear on Bear Kingdom: 90,70 -> 89,70
UPDATE npc_spawns SET map_x=95, map_y=76 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=129 AND map_id=43 AND map_x=95 AND map_y=70 LIMIT 1); -- Patrol Bear on Bear Kingdom: 95,70 -> 95,76
UPDATE npc_spawns SET map_x=5, map_y=74 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=129 AND map_id=43 AND map_x=5 AND map_y=75 LIMIT 1); -- Patrol Bear on Bear Kingdom: 5,75 -> 5,74
UPDATE npc_spawns SET map_x=94, map_y=76 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=129 AND map_id=43 AND map_x=95 AND map_y=75 LIMIT 1); -- Patrol Bear on Bear Kingdom: 95,75 -> 94,76
UPDATE npc_spawns SET map_x=35, map_y=89 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=129 AND map_id=43 AND map_x=35 AND map_y=90 LIMIT 1); -- Patrol Bear on Bear Kingdom: 35,90 -> 35,89
UPDATE npc_spawns SET map_x=55, map_y=91 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=129 AND map_id=43 AND map_x=55 AND map_y=90 LIMIT 1); -- Patrol Bear on Bear Kingdom: 55,90 -> 55,91
UPDATE npc_spawns SET map_x=85, map_y=4 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=130 AND map_id=42 AND map_x=85 AND map_y=5 LIMIT 1); -- Young Bear on Rugged Valley: 85,5 -> 85,4
UPDATE npc_spawns SET map_x=85, map_y=71 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=130 AND map_id=42 AND map_x=85 AND map_y=70 LIMIT 1); -- Young Bear on Rugged Valley: 85,70 -> 85,71
UPDATE npc_spawns SET map_x=90, map_y=71 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=130 AND map_id=42 AND map_x=90 AND map_y=70 LIMIT 1); -- Young Bear on Rugged Valley: 90,70 -> 90,71
UPDATE npc_spawns SET map_x=95, map_y=71 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=130 AND map_id=42 AND map_x=95 AND map_y=70 LIMIT 1); -- Young Bear on Rugged Valley: 95,70 -> 95,71
UPDATE npc_spawns SET map_x=30, map_y=74 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=130 AND map_id=42 AND map_x=30 AND map_y=75 LIMIT 1); -- Young Bear on Rugged Valley: 30,75 -> 30,74
UPDATE npc_spawns SET map_x=35, map_y=74 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=130 AND map_id=42 AND map_x=35 AND map_y=75 LIMIT 1); -- Young Bear on Rugged Valley: 35,75 -> 35,74
UPDATE npc_spawns SET map_x=40, map_y=74 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=130 AND map_id=42 AND map_x=40 AND map_y=75 LIMIT 1); -- Young Bear on Rugged Valley: 40,75 -> 40,74
UPDATE npc_spawns SET map_x=45, map_y=74 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=130 AND map_id=42 AND map_x=45 AND map_y=75 LIMIT 1); -- Young Bear on Rugged Valley: 45,75 -> 45,74
UPDATE npc_spawns SET map_x=50, map_y=74 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=130 AND map_id=42 AND map_x=50 AND map_y=75 LIMIT 1); -- Young Bear on Rugged Valley: 50,75 -> 50,74
UPDATE npc_spawns SET map_x=55, map_y=74 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=130 AND map_id=42 AND map_x=55 AND map_y=75 LIMIT 1); -- Young Bear on Rugged Valley: 55,75 -> 55,74
UPDATE npc_spawns SET map_x=60, map_y=74 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=130 AND map_id=42 AND map_x=60 AND map_y=75 LIMIT 1); -- Young Bear on Rugged Valley: 60,75 -> 60,74
UPDATE npc_spawns SET map_x=65, map_y=74 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=130 AND map_id=42 AND map_x=65 AND map_y=75 LIMIT 1); -- Young Bear on Rugged Valley: 65,75 -> 65,74
UPDATE npc_spawns SET map_x=75, map_y=74 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=130 AND map_id=42 AND map_x=75 AND map_y=75 LIMIT 1); -- Young Bear on Rugged Valley: 75,75 -> 75,74
UPDATE npc_spawns SET map_x=50, map_y=89 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=130 AND map_id=42 AND map_x=50 AND map_y=90 LIMIT 1); -- Young Bear on Rugged Valley: 50,90 -> 50,89
UPDATE npc_spawns SET map_x=83, map_y=5 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=197 AND map_id=47 AND map_x=83 AND map_y=6 LIMIT 1); -- Emissary Green on Martrydom Maze: 83,6 -> 83,5
UPDATE npc_spawns SET map_x=33, map_y=7 WHERE rowid=(SELECT rowid FROM npc_spawns WHERE npc_id=244 AND map_id=60 AND map_x=33 AND map_y=8 LIMIT 1); -- Merry Savage on Winterside: 33,8 -> 33,7
COMMIT;
