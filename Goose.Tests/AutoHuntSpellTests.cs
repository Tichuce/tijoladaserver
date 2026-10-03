using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Text.Json;
using Goose.Events;

namespace Goose.Tests;

public class AutoHuntSpellTests : IDisposable
{
    private readonly string dataDirectory;
    private readonly GameWorld world;
    private readonly Map map;
    private readonly List<Socket> sockets = new();

    private const int MapId = 1;
    private const int ClassId = 1;

    public AutoHuntSpellTests()
    {
        dataDirectory = Path.Combine(Path.GetTempPath(), "auto-hunt-spells-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Path.Combine(dataDirectory, "Scripts", "Quest"));
        var settings = new GooseSettings
        {
            DataPath = dataDirectory, ExperienceModifier = 1, DamageModifier = 1,
            InventorySize = 30, EquippedSize = 20, CombineBagSize = 10, SpellbookSize = 30,
            MaxAC = 3500, MaxPlayers = 200, MaxNPCs = 15000,
        };
        world = new GameWorld(settings);

        var m = new Map { ID = MapId, Name = "Test", Width = 30, Height = 30, CanCast = true };
        m.characters = new ICharacter[(m.Width + 1) * (m.Height + 1)];
        m.tiles = new ITile[(m.Width + 1) * (m.Height + 1)];
        world.MapHandler.Maps[MapId] = m;
        map = m;

        var cls = new Class { ClassID = ClassId, ClassName = "Test", ACMultiplier = 1.0 };
        cls.AddLevel(new ClassLevel { Level = 50, BaseStats = new AttributeSet() });
        var classes = (Dictionary<int, Class>)typeof(ClassHandler)
            .GetField("classes", BindingFlags.NonPublic | BindingFlags.Instance)!
            .GetValue(world.ClassHandler)!;
        classes[ClassId] = cls;
    }

    public void Dispose()
    {
        foreach (var s in sockets) s.Dispose();
        if (Directory.Exists(dataDirectory)) Directory.Delete(dataDirectory, recursive: true);
    }

    private Player PlacePlayer(int x, int y)
    {
        var p = new Player(0);
        p.OnLogin();
        p.Inventory = new Inventory(p, world.Settings);
        p.Spellbook = new Spellbook(p, world.Settings);
        var klass = new Class { ClassID = ClassId, ClassName = "Test", ACMultiplier = 1.0 };
        klass.AddLevel(new ClassLevel { Level = 1, ClassID = ClassId, BaseStats = new AttributeSet() });
        p.Class = klass;
        p.BaseStats = new AttributeSet { HP = 100, MP = 100 };
        p.MaxStats = p.BaseStats + new AttributeSet();
        p.CurrentHP = 100;
        p.CurrentMP = 100;
        p.Access = Player.AccessStatus.Normal;
        p.State = Player.States.Ready;
        var sock = new Socket(AddressFamily.InterNetwork, SocketType.Stream, ProtocolType.Tcp) { Blocking = false };
        sockets.Add(sock);
        p.Sock = sock;

        p.Map = map;
        p.MapID = MapId;
        p.MapX = x;
        p.MapY = y;
        map.AddPlayer(p, world);
        map.SetCharacter(p, x, y);
        return p;
    }

    private NPC SpawnNpc(int x, int y, int templateId = 1, string name = "Rat")
    {
        var template = new NPCTemplate
        {
            NPCTemplateID = templateId,
            Name = name,
            Level = 50,
            ClassID = ClassId,
            NPCType = NPCTemplate.Types.Monster,
            CanBeKilled = true,
            BaseStats = new AttributeSet { HP = 1000 },
            AggroRange = 0,
            MoveSpeed = 0,
            Allies = new List<NPCTemplate>(),
        };
        return world.NPCHandler.SpawnNPC(world, MapId, x, y, template, shouldRespawn: false)!;
    }

    private static Spell NewSpell(int id, Spell.SpellTargets target, SpellEffect.EffectTypes type, SpellEffect.SpellEffected effected,
        string hp = "0", SpellEffect.TargetTypes area = SpellEffect.TargetTypes.Target, int size = 0,
        int mp = 0, long aether = 0, long duration = 0, long taunt = 0)
    {
        var effect = new SpellEffect
        {
            ID = id, Name = "Effect " + id, EffectType = type, Effected = effected,
            TargetType = area, TargetSize = size, HPFormula = hp, MPFormula = "0", SPFormula = "0",
            Duration = duration, TauntAggro = taunt, MinimumLevelEffected = 0, MaximumLevelEffected = 1000,
            WorksInPVP = true, WorksNotInPVP = true, OnEffectText = "", OffEffectText = "",
        };
        return new Spell
        {
            ID = id, Name = "Spell " + id, Description = "", Target = target,
            Aether = aether, MPStaticCost = mp, SpellEffectID = id, SpellEffect = effect,
        };
    }

    private Spell Learn(Player p, Spell spell)
    {
        Assert.True(p.Spellbook.AddSpell(spell, world));
        return spell;
    }

    private static Spell Strike(int id = 5) => NewSpell(id, Spell.SpellTargets.Target, SpellEffect.EffectTypes.Formula,
        SpellEffect.SpellEffected.NPCPlayer, hp: "-10", mp: 5, aether: 500);

    private static Spell Heal(int id = 1) => NewSpell(id, Spell.SpellTargets.Target, SpellEffect.EffectTypes.Formula,
        SpellEffect.SpellEffected.SelfPlayer, hp: "25", mp: 5);

    private static Spell Fortify(int id = 2) => NewSpell(id, Spell.SpellTargets.Target, SpellEffect.EffectTypes.Buff,
        SpellEffect.SpellEffected.SelfPlayer, mp: 20, aether: 5000, duration: 600);

    private static void Configure(Player p, AutoHuntSettings settings) => AutoHuntSettings.Store(p, settings);

    private static string Buffer(Player p) => Encoding.ASCII.GetString(p.SendBuffer.ToArray());

    private void Tick(Player p) => p.AutoHuntEvent!.Ready(world);

    [Fact]
    public void Classify_UsesRealSpellData()
    {
        Assert.Equal(AutoHuntSpellCategory.Heal, AutoHuntSpells.Classify(Heal()));
        Assert.Equal(AutoHuntSpellCategory.Attack, AutoHuntSpells.Classify(Strike()));
        Assert.Equal(AutoHuntSpellCategory.Buff, AutoHuntSpells.Classify(Fortify()));
        Assert.Equal(AutoHuntSpellCategory.Taunt, AutoHuntSpells.Classify(NewSpell(4, Spell.SpellTargets.Target,
            SpellEffect.EffectTypes.Formula, SpellEffect.SpellEffected.NPC, hp: "-1", taunt: 1000)));
        Assert.Equal(AutoHuntSpellCategory.Attack, AutoHuntSpells.Classify(NewSpell(23, Spell.SpellTargets.Self,
            SpellEffect.EffectTypes.Stun, SpellEffect.SpellEffected.NPC, hp: "-30", area: SpellEffect.TargetTypes.Cross, size: 1, duration: 10)));
        Assert.Equal(AutoHuntSpellCategory.Other, AutoHuntSpells.Classify(NewSpell(10, Spell.SpellTargets.Self,
            SpellEffect.EffectTypes.Teleport, SpellEffect.SpellEffected.SelfPlayer)));
        Assert.Equal(AutoHuntSpellCategory.Heal, AutoHuntSpells.Classify(NewSpell(94, Spell.SpellTargets.Target,
            SpellEffect.EffectTypes.Formula, SpellEffect.SpellEffected.SelfPlayer, hp: "%ccmp")));
    }

    [Fact]
    public void Validate_KeepsOnlyKnownSpellsOfTheRightCategoryAndClamps()
    {
        var player = PlacePlayer(10, 10);
        Learn(player, Strike());
        Learn(player, Heal());

        var settings = new AutoHuntSettings
        {
            Attack = [new() { SpellId = 5, MinMPPercent = 400, Range = 99 }, new() { SpellId = 5 }, new() { SpellId = 1 }, new() { SpellId = 77 }],
            Heal = [new() { SpellId = 1, HPPercent = -5 }],
            KeepDistance = 50,
            MinDistance = 40,
        };
        settings.Validate(player, world);

        var attack = Assert.Single(settings.Attack);
        Assert.Equal(5, attack.SpellId);
        Assert.Equal(100, attack.MinMPPercent);
        Assert.Equal(AutoHuntSettings.MaxRange, attack.Range);
        Assert.Equal(0, Assert.Single(settings.Heal).HPPercent);
        Assert.Equal(AutoHuntSettings.MaxDistance, settings.KeepDistance);
        Assert.Equal(AutoHuntSettings.MaxDistance, settings.MinDistance);
    }

    [Fact]
    public void TryApply_StoresSettingsInPlayerPropertiesAndReloads()
    {
        var player = PlacePlayer(10, 10);
        Learn(player, Strike());
        string json = "{\"atk\":[{\"id\":5,\"mp\":30,\"rng\":6}],\"min\":2,\"max\":5,\"melee\":false}";

        Assert.True(AutoHuntSettings.TryApply(player, world, ProtocolTextCodec.EncodeText(json)));
        player.AutoHuntSettingsCache = null;

        var loaded = AutoHuntSettings.For(player);
        Assert.False(loaded.Melee);
        Assert.Equal((2, 5), (loaded.MinDistance, loaded.KeepDistance));
        Assert.Equal(30, Assert.Single(loaded.Attack).MinMPPercent);
        Assert.IsType<string>(player.Properties[AutoHuntSettings.PropertyKey]);
    }

    [Fact]
    public void TryApply_RejectsGarbage()
    {
        var player = PlacePlayer(10, 10);

        Assert.False(AutoHuntSettings.TryApply(player, world, ""));
        Assert.False(AutoHuntSettings.TryApply(player, world, "not base64!"));
        Assert.False(AutoHuntSettings.TryApply(player, world, ProtocolTextCodec.EncodeText("{broken")));
        Assert.False(player.Properties.ContainsKey(AutoHuntSettings.PropertyKey));
    }

    [Fact]
    public void ConfigJson_ListsSpellbookWithCategories()
    {
        var player = PlacePlayer(10, 10);
        Learn(player, Strike());
        Learn(player, Heal());

        using var doc = JsonDocument.Parse(AutoHuntSettings.ConfigJson(player, world));
        var spells = doc.RootElement.GetProperty("spells").EnumerateArray().ToList();

        Assert.Equal(2, spells.Count);
        Assert.Equal("attack", spells[0].GetProperty("cat").GetString());
        Assert.Equal(1, spells[0].GetProperty("slot").GetInt32());
        Assert.Equal("heal", spells[1].GetProperty("cat").GetString());
        Assert.True(doc.RootElement.GetProperty("cfg").GetProperty("melee").GetBoolean());
    }

    [Fact]
    public void AttackSpell_CastsFromRangeWithoutWalking()
    {
        var player = PlacePlayer(10, 10);
        Learn(player, Strike());
        var npc = SpawnNpc(14, 10);
        Configure(player, new AutoHuntSettings { Attack = [new() { SpellId = 5, Range = 6 }], Melee = false, KeepDistance = 6 });
        player.StartAutoHunt(world);

        Tick(player);

        Assert.Equal((10, 10), (player.MapX, player.MapY));
        Assert.Equal(95, player.CurrentMP);
        Assert.True(npc.CurrentHP < 1000);
        Assert.Equal("casting", player.AutoHuntState);
    }

    [Fact]
    public void AttackSpell_OutOfRange_ApproachesUntilInRange()
    {
        var player = PlacePlayer(10, 10);
        Learn(player, Strike());
        SpawnNpc(18, 10);
        Configure(player, new AutoHuntSettings { Attack = [new() { SpellId = 5, Range = 5 }], Melee = false, KeepDistance = 5 });
        player.StartAutoHunt(world);

        Tick(player);

        Assert.Equal((11, 10), (player.MapX, player.MapY));
        Assert.Equal(100, player.CurrentMP);
        Assert.Equal("moving", player.AutoHuntState);
    }

    [Fact]
    public void AttackSpell_RespectsMinimumMana()
    {
        var player = PlacePlayer(10, 10);
        Learn(player, Strike());
        SpawnNpc(13, 10);
        player.CurrentMP = 40;
        Configure(player, new AutoHuntSettings { Attack = [new() { SpellId = 5, MinMPPercent = 50 }], Melee = false, KeepDistance = 6 });
        player.StartAutoHunt(world);

        Tick(player);

        Assert.Equal(40, player.CurrentMP);
        Assert.Equal("waiting", player.AutoHuntState);
    }

    [Fact]
    public void AreaSpell_WaitsForEnoughMonstersAndPicksTheBestCentre()
    {
        var player = PlacePlayer(10, 10);
        var blast = Learn(player, NewSpell(14, Spell.SpellTargets.Target, SpellEffect.EffectTypes.Formula,
            SpellEffect.SpellEffected.NPCPlayer, hp: "-80", area: SpellEffect.TargetTypes.Area, size: 1, mp: 10));
        var lone = SpawnNpc(13, 10);
        Configure(player, new AutoHuntSettings { Attack = [new() { SpellId = 14, MinTargets = 2 }], Melee = false, KeepDistance = 8 });
        player.StartAutoHunt(world);

        Tick(player);
        Assert.Equal(100, player.CurrentMP);

        var a = SpawnNpc(10, 15);
        var b = SpawnNpc(11, 16);
        Tick(player);

        Assert.Equal(90, player.CurrentMP);
        Assert.Equal(1000, lone.CurrentHP);
        Assert.True(a.CurrentHP < 1000 && b.CurrentHP < 1000);
    }

    [Fact]
    public void SelfLineSpell_FacesTheMonsterBeforeCasting()
    {
        var player = PlacePlayer(10, 10);
        player.Facing = Direction.Up;
        Learn(player, NewSpell(3, Spell.SpellTargets.Self, SpellEffect.EffectTypes.Formula,
            SpellEffect.SpellEffected.NPCPlayer, hp: "-20", area: SpellEffect.TargetTypes.LineFront, size: 1, mp: 20, aether: 18000));
        var npc = SpawnNpc(9, 10);
        Configure(player, new AutoHuntSettings { Attack = [new() { SpellId = 3 }] });
        player.StartAutoHunt(world);

        Tick(player);

        Assert.Equal(Direction.Left, player.Facing);
        Assert.True(npc.CurrentHP < 1000);
    }

    [Fact]
    public void Heal_CastsOnSelfBelowThreshold()
    {
        var player = PlacePlayer(10, 10);
        Learn(player, Heal());
        player.CurrentHP = 40;
        Configure(player, new AutoHuntSettings { Heal = [new() { SpellId = 1, HPPercent = 60 }] });
        player.StartAutoHunt(world);

        Tick(player);

        Assert.Equal(65, player.CurrentHP);
        Assert.Equal("healing", player.AutoHuntState);
    }

    [Fact]
    public void Heal_SkipsWhenAboveThreshold()
    {
        var player = PlacePlayer(10, 10);
        Learn(player, Heal());
        player.CurrentHP = 70;
        Configure(player, new AutoHuntSettings { Heal = [new() { SpellId = 1, HPPercent = 60 }] });
        player.StartAutoHunt(world);

        Tick(player);

        Assert.Equal(70, player.CurrentHP);
        Assert.Equal(100, player.CurrentMP);
    }

    [Fact]
    public void Heal_PicksTheMostInjuredGroupMember()
    {
        var healer = PlacePlayer(10, 10);
        var friend = PlacePlayer(12, 10);
        var group = new Group();
        group.Players.Add(healer);
        group.Players.Add(friend);
        healer.Group = group;
        friend.Group = group;
        Learn(healer, Heal());
        healer.CurrentHP = 55;
        friend.CurrentHP = 30;
        Configure(healer, new AutoHuntSettings { Heal = [new() { SpellId = 1, HPPercent = 60 }] });
        healer.StartAutoHunt(world);

        Tick(healer);

        Assert.Equal(55, friend.CurrentHP);
        Assert.Equal(55, healer.CurrentHP);
    }

    [Fact]
    public void GroupHeal_NotWastedOnOneMinorInjury()
    {
        var healer = PlacePlayer(10, 10);
        var friend = PlacePlayer(12, 10);
        var group = new Group();
        group.Players.Add(healer);
        group.Players.Add(friend);
        healer.Group = group;
        friend.Group = group;
        Learn(healer, NewSpell(107, Spell.SpellTargets.Group, SpellEffect.EffectTypes.Formula,
            SpellEffect.SpellEffected.SelfPlayer, hp: "20", mp: 10));
        friend.CurrentHP = 50;
        Configure(healer, new AutoHuntSettings { Heal = [new() { SpellId = 107, HPPercent = 60, MinTargets = 2 }] });
        healer.StartAutoHunt(world);

        Tick(healer);
        Assert.Equal(100, healer.CurrentMP);

        friend.CurrentHP = 25;
        Tick(healer);
        Assert.Equal(90, healer.CurrentMP);
        Assert.Equal(45, friend.CurrentHP);
    }

    [Fact]
    public void Buff_CastsWhenMissingAndNotAgainWhileActive()
    {
        var player = PlacePlayer(10, 10);
        Learn(player, Fortify());
        Configure(player, new AutoHuntSettings { Buff = [new() { SpellId = 2 }] });
        player.StartAutoHunt(world);

        Tick(player);
        Assert.Equal(80, player.CurrentMP);
        Assert.Contains(player.Buffs, b => b.SpellEffect.ID == 2);

        player.Spellbook.SetSlotLastCast(1, long.MinValue >> 1);
        Tick(player);
        Assert.Equal(80, player.CurrentMP);
    }

    [Fact]
    public void Buff_RespectsMinimumHp()
    {
        var player = PlacePlayer(10, 10);
        Learn(player, Fortify());
        player.CurrentHP = 30;
        Configure(player, new AutoHuntSettings { Buff = [new() { SpellId = 2, HPPercent = 50 }] });
        player.StartAutoHunt(world);

        Tick(player);

        Assert.Equal(100, player.CurrentMP);
        Assert.Empty(player.Buffs);
    }

    [Fact]
    public void Ranged_StepsAwayFromMonstersInsideMinimumDistance()
    {
        var player = PlacePlayer(10, 10);
        SpawnNpc(11, 10);
        Configure(player, new AutoHuntSettings { Melee = false, MinDistance = 3, KeepDistance = 5 });
        player.StartAutoHunt(world);

        Tick(player);

        Assert.Equal((9, 10), (player.MapX, player.MapY));
        Assert.Equal("repositioning", player.AutoHuntState);
    }

    [Fact]
    public void Ranged_NeverSwingsInMelee()
    {
        var player = PlacePlayer(10, 10);
        SpawnNpc(11, 10);
        Configure(player, new AutoHuntSettings { Melee = false, KeepDistance = 3 });
        player.StartAutoHunt(world);
        player.SendBuffer.Clear();

        Tick(player);

        Assert.DoesNotContain("ATT", Buffer(player));
        Assert.Equal((10, 10), (player.MapX, player.MapY));
        Assert.Equal("waiting", player.AutoHuntState);
    }

    [Fact]
    public void Status_IsOnlySentToSyncedClientsAndOnlyOnChange()
    {
        var player = PlacePlayer(10, 10);
        SpawnNpc(20, 10);
        player.StartAutoHunt(world);
        Tick(player);
        Assert.DoesNotContain("AHS", Buffer(player));

        player.AutoHuntSynced = true;
        player.SendBuffer.Clear();
        player.PauseAutoHunt(world);
        player.PauseAutoHunt(world);

        Assert.Single(Buffer(player).Split('\x1'), s => s.StartsWith("AHSpaused,"));
    }

    [Fact]
    public void Spells_WithoutSpellbookOrSettings_KeepMeleeHunting()
    {
        var player = PlacePlayer(10, 10);
        player.Spellbook = null!;
        SpawnNpc(14, 10);
        player.StartAutoHunt(world);

        Tick(player);

        Assert.Equal((11, 10), (player.MapX, player.MapY));
    }

    private static Spell Taunt(int id = 4) => NewSpell(id, Spell.SpellTargets.Target, SpellEffect.EffectTypes.Formula,
        SpellEffect.SpellEffected.NPC, hp: "-1", mp: 10, aether: 5000, taunt: 1000);

    private static Spell AreaTaunt(int id = 22, int size = 2) => NewSpell(id, Spell.SpellTargets.Self, SpellEffect.EffectTypes.Formula,
        SpellEffect.SpellEffected.NPC, hp: "-1", area: SpellEffect.TargetTypes.Area, size: size, mp: 40, aether: 10000, taunt: 3000);

    private static AutoHuntSettings Tank(AutoHuntTauntSettings mt)
    {
        mt.Enabled = true;
        return new AutoHuntSettings { Taunt = mt };
    }

    [Fact]
    public void Validate_TauntSlotsKeepOnlyTheRightKindOfTaunt()
    {
        var player = PlacePlayer(10, 10);
        Learn(player, Taunt());
        Learn(player, AreaTaunt());
        Learn(player, Strike());

        var settings = new AutoHuntSettings
        {
            Taunt = new AutoHuntTauntSettings { Single = [22, 4, 5, 4], Area = [4, 22], Desired = 9, Maximum = 3, MinDistance = 9, MaxDistance = 4 },
            PriorityMonsters = [7, 8, 8],
            IgnoredMonsters = [8],
        };
        settings.Validate(player, world);

        Assert.Equal(new[] { 4 }, settings.Taunt.Single);
        Assert.Equal(new[] { 22 }, settings.Taunt.Area);
        Assert.Equal(9, settings.Taunt.Maximum);
        Assert.Equal(4, settings.Taunt.MinDistance);
        Assert.Equal(new[] { 7 }, settings.PriorityMonsters);
        Assert.Equal(new[] { 8 }, settings.IgnoredMonsters);
    }

    [Fact]
    public void Pull_TauntsAnUntauntedMonsterFromRangeWithoutWalking()
    {
        var player = PlacePlayer(10, 10);
        Learn(player, Taunt());
        var npc = SpawnNpc(14, 10);
        Configure(player, Tank(new AutoHuntTauntSettings { Single = [4], MinDistance = 0, MaxDistance = 6 }));
        player.StartAutoHunt(world);

        Tick(player);

        Assert.Same(player, npc.AggroTarget);
        Assert.Equal(90, player.CurrentMP);
        Assert.Equal((10, 10), (player.MapX, player.MapY));
        Assert.Equal("pulling", player.AutoHuntState);
    }

    [Fact]
    public void Pull_ApproachesAMonsterBeyondTauntRange()
    {
        var player = PlacePlayer(10, 10);
        Learn(player, Taunt());
        var npc = SpawnNpc(19, 10);
        Configure(player, Tank(new AutoHuntTauntSettings { Single = [4], MaxDistance = 4, Radius = 12 }));
        player.StartAutoHunt(world);

        Tick(player);

        Assert.Equal((11, 10), (player.MapX, player.MapY));
        Assert.Null(npc.AggroTarget);
        Assert.Equal("Approaching Rat", player.AutoHuntDetail);
    }

    [Fact]
    public void Pull_StopsAtTheDesiredCount()
    {
        var player = PlacePlayer(10, 10);
        Learn(player, Taunt());
        var first = SpawnNpc(13, 10);
        var second = SpawnNpc(10, 14);
        Configure(player, Tank(new AutoHuntTauntSettings { Single = [4], Desired = 1, MinDistance = 0 }));
        player.StartAutoHunt(world);

        Tick(player);
        player.Spellbook.SetSlotLastCast(1, long.MinValue >> 1);
        Tick(player);

        Assert.Same(player, first.AggroTarget);
        Assert.Null(second.AggroTarget);
    }

    [Fact]
    public void Pull_SkipsMonstersCloserThanTheMinimumDistance()
    {
        var player = PlacePlayer(10, 10);
        Learn(player, Taunt());
        var near = SpawnNpc(11, 11);
        var far = SpawnNpc(14, 10);
        Configure(player, Tank(new AutoHuntTauntSettings { Single = [4], MinDistance = 3, Desired = 4 }));
        player.StartAutoHunt(world);

        Tick(player);

        Assert.Null(near.AggroTarget);
        Assert.Same(player, far.AggroTarget);
    }

    [Fact]
    public void AreaTaunt_NeedsTheMinimumNumberOfMonsters()
    {
        var player = PlacePlayer(10, 10);
        Learn(player, AreaTaunt());
        var a = SpawnNpc(12, 10);
        Configure(player, Tank(new AutoHuntTauntSettings { Area = [22], AreaMinimum = 2 }));
        player.StartAutoHunt(world);

        Tick(player);
        Assert.Equal(100, player.CurrentMP);

        var b = SpawnNpc(10, 12);
        Tick(player);

        Assert.Equal(60, player.CurrentMP);
        Assert.Same(player, a.AggroTarget);
        Assert.Same(player, b.AggroTarget);
    }

    [Fact]
    public void AreaTaunt_RespectsTheMaximumMonsterCount()
    {
        var player = PlacePlayer(10, 10);
        Learn(player, AreaTaunt());
        SpawnNpc(12, 10);
        SpawnNpc(10, 12);
        SpawnNpc(8, 10);
        Configure(player, Tank(new AutoHuntTauntSettings { Area = [22], AreaMinimum = 2, Desired = 2, Maximum = 2 }));
        player.StartAutoHunt(world);

        Tick(player);

        Assert.Equal(100, player.CurrentMP);
    }

    [Fact]
    public void Rescue_TauntsAMonsterOffAGroupMember()
    {
        var tank = PlacePlayer(10, 10);
        var mage = PlacePlayer(15, 10);
        var group = new Group();
        group.Players.Add(tank);
        group.Players.Add(mage);
        tank.Group = group;
        mage.Group = group;
        Learn(tank, Taunt());
        var npc = SpawnNpc(14, 10);
        npc.AddAggro(mage, 500, world);
        Configure(tank, Tank(new AutoHuntTauntSettings { Single = [4], Pull = false }));
        tank.StartAutoHunt(world);

        Tick(tank);

        Assert.Same(tank, npc.AggroTarget);
        Assert.Contains("rescue", tank.AutoHuntDetail);
    }

    [Fact]
    public void Ignored_MonstersAreNotHuntedUnlessTheyAttack()
    {
        var player = PlacePlayer(10, 10);
        var skipped = SpawnNpc(12, 10, templateId: 7, name: "Bat");
        var hunted = SpawnNpc(10, 15, templateId: 8, name: "Rat");
        Configure(player, new AutoHuntSettings { IgnoredMonsters = [7] });
        player.StartAutoHunt(world);

        Tick(player);
        Assert.Same(hunted, player.AutoHuntTarget);

        player.AutoHuntTarget = null;
        skipped.AddAggro(player, 5, world);
        Tick(player);
        Assert.Same(skipped, player.AutoHuntTarget);
    }

    [Fact]
    public void Priority_MonstersAreHuntedFirst()
    {
        var player = PlacePlayer(10, 10);
        SpawnNpc(12, 10, templateId: 7, name: "Bat");
        var wanted = SpawnNpc(10, 16, templateId: 8, name: "Boss");
        Configure(player, new AutoHuntSettings { PriorityMonsters = [8] });
        player.StartAutoHunt(world);

        Tick(player);

        Assert.Same(wanted, player.AutoHuntTarget);
    }

    [Fact]
    public void Pull_WaitsForTauntedMonstersToArrive()
    {
        var player = PlacePlayer(10, 10);
        var npc = SpawnNpc(13, 10);
        npc.MoveSpeed = 0.4;
        npc.AddAggro(player, 5, world);
        Configure(player, Tank(new AutoHuntTauntSettings { Single = [4] }));
        player.StartAutoHunt(world);

        Tick(player);

        Assert.Equal((10, 10), (player.MapX, player.MapY));
        Assert.Equal("pulling", player.AutoHuntState);
    }

    [Fact]
    public void ConfigJson_ListsMonstersOnTheMap()
    {
        var player = PlacePlayer(10, 10);
        SpawnNpc(12, 10, templateId: 7, name: "Bat");
        SpawnNpc(13, 10, templateId: 7, name: "Bat");
        SpawnNpc(14, 10, templateId: 8, name: "Rat");

        using var doc = JsonDocument.Parse(AutoHuntSettings.ConfigJson(player, world));
        var mobs = doc.RootElement.GetProperty("mobs").EnumerateArray().ToList();

        Assert.Equal(2, mobs.Count);
        var bat = mobs.Single(m => m.GetProperty("tid").GetInt32() == 7);
        Assert.Equal("Bat", bat.GetProperty("name").GetString());
        Assert.Equal(2, bat.GetProperty("n").GetInt32());
        Assert.False(doc.RootElement.GetProperty("cfg").GetProperty("mt").GetProperty("on").GetBoolean());
    }
}
