using System.Net.Sockets;
using System.Reflection;
using System.Text;
using Goose.Events;

namespace Goose.Tests;

public class AutoHuntTests : IDisposable
{
    private readonly string dataDirectory;
    private readonly GameWorld world;
    private readonly Map map;
    private readonly List<Socket> sockets = new();

    private const int MapId = 1;
    private const int ClassId = 1;

    public AutoHuntTests()
    {
        dataDirectory = Path.Combine(Path.GetTempPath(), "auto-hunt-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Path.Combine(dataDirectory, "Scripts", "Quest"));
        var settings = new GooseSettings
        {
            DataPath = dataDirectory, ExperienceModifier = 1,
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

    private NPC SpawnNpc(int x, int y, NPCTemplate.Types type = NPCTemplate.Types.Monster, bool killable = true)
    {
        var template = new NPCTemplate
        {
            NPCTemplateID = 1,
            Name = "Rat",
            Level = 50,
            ClassID = ClassId,
            NPCType = type,
            CanBeKilled = killable,
            BaseStats = new AttributeSet { HP = 1000 },
            AggroRange = 0,
            MoveSpeed = 0,
            Allies = new List<NPCTemplate>(),
        };
        return world.NPCHandler.SpawnNPC(world, MapId, x, y, template, shouldRespawn: false)!;
    }

    private static string Buffer(Player p) => Encoding.ASCII.GetString(p.SendBuffer.ToArray());

    private static AutoHuntEvent Tick(Player p, GameWorld world)
    {
        var ev = p.AutoHuntEvent!;
        ev.Ready(world);
        return ev;
    }

    [Fact]
    public void Tick_StepsTowardNearestMonsterAndTellsClientItsPosition()
    {
        var player = PlacePlayer(10, 10);
        var near = SpawnNpc(14, 10);
        SpawnNpc(10, 20);
        player.StartAutoHunt(world);
        player.SendBuffer.Clear();

        Tick(player, world);

        Assert.Same(near, player.AutoHuntTarget);
        Assert.Equal((11, 10), (player.MapX, player.MapY));
        Assert.Contains("SUP11,10", Buffer(player));
    }

    [Fact]
    public void Tick_IgnoresVendorsUnkillableAndOutOfRadiusNpcs()
    {
        world.Settings.AutoHuntRadius = 5;
        var player = PlacePlayer(10, 10);
        SpawnNpc(12, 10, NPCTemplate.Types.Vendor);
        SpawnNpc(10, 12, killable: false);
        SpawnNpc(20, 10);
        player.StartAutoHunt(world);

        Tick(player, world);

        Assert.Null(player.AutoHuntTarget);
        Assert.Equal((10, 10), (player.MapX, player.MapY));
        Assert.True(player.IsAutoHunting);
    }

    [Fact]
    public void Tick_NeverStepsOntoAWarpTile()
    {
        var player = PlacePlayer(10, 10);
        map.SetTile(11, 10, new WarpTile { WarpMap = map, WarpX = 1, WarpY = 1 });
        map.SetTile(10, 9, new BlockedTile());
        map.SetTile(10, 11, new BlockedTile());
        SpawnNpc(12, 10);
        player.StartAutoHunt(world);

        for (int i = 0; i < 10; i++) Tick(player, world);

        Assert.NotEqual((11, 10), (player.MapX, player.MapY));
    }

    [Fact]
    public void Tick_AdjacentMonster_FacesItAndSwings()
    {
        var player = PlacePlayer(10, 10);
        player.Facing = Direction.Up;
        SpawnNpc(11, 10);
        player.StartAutoHunt(world);

        Tick(player, world);

        Assert.Equal(Direction.Right, player.Facing);
        Assert.Equal((10, 10), (player.MapX, player.MapY));
        Assert.NotEqual(0, player.LastAttack);
    }

    [Fact]
    public void Tick_AutoHuntSwing_IsShownToTheHuntersOwnClient()
    {
        var player = PlacePlayer(10, 10);
        SpawnNpc(11, 10);
        player.StartAutoHunt(world);
        player.SendBuffer.Clear();

        Tick(player, world);

        Assert.Contains("ATT" + player.LoginID + "\x1", Buffer(player));
    }

    [Fact]
    public void Tick_SwingStillOnCooldown_SendsNoAttack()
    {
        var player = PlacePlayer(10, 10);
        SpawnNpc(11, 10);
        player.StartAutoHunt(world);
        Tick(player, world);
        player.SendBuffer.Clear();

        Tick(player, world); // same instant: the weapon delay has not passed

        Assert.DoesNotContain("ATT" + player.LoginID + "\x1", Buffer(player));
    }

    [Fact]
    public void LowHpThreshold_DefaultsToFivePercent()
    {
        Assert.Equal(5, new GooseSettings().AutoHuntMinHPPercent);
    }

    [Fact]
    public void Tick_HpJustAboveFivePercent_KeepsHunting()
    {
        world.Settings.AutoHuntMinHPPercent = 5;
        var player = PlacePlayer(10, 10);
        SpawnNpc(14, 10);
        player.StartAutoHunt(world);
        player.CurrentHP = 6;

        Tick(player, world);

        Assert.True(player.IsAutoHunting);
        Assert.Equal((11, 10), (player.MapX, player.MapY));
    }

    [Fact]
    public void Tick_HpAtExactlyFivePercent_Stops()
    {
        world.Settings.AutoHuntMinHPPercent = 5;
        var player = PlacePlayer(10, 10);
        SpawnNpc(14, 10);
        player.StartAutoHunt(world);
        player.CurrentHP = 5;

        Tick(player, world);

        Assert.False(player.IsAutoHunting);
    }

    [Fact]
    public void Tick_LowHp_StopsEvenWhenNoNearbyNpcHasAggroRange()
    {
        world.Settings.AutoHuntMinHPPercent = 5;
        var player = PlacePlayer(10, 10);
        SpawnNpc(11, 10); // adjacent, AggroRange 0
        player.StartAutoHunt(world);
        player.CurrentHP = 3;

        Tick(player, world);

        Assert.False(player.IsAutoHunting);
        Assert.Equal(0, player.LastAttack);
    }

    [Fact]
    public void Tick_LowHp_StopsWithMessage()
    {
        world.Settings.AutoHuntMinHPPercent = 5;
        var player = PlacePlayer(10, 10);
        SpawnNpc(14, 10);
        player.StartAutoHunt(world);
        player.CurrentHP = 4;
        player.SendBuffer.Clear();

        Tick(player, world);

        Assert.False(player.IsAutoHunting);
        Assert.Contains("Auto-hunt stopped: your HP is low.", Buffer(player));
    }

    [Fact]
    public void ManualMove_StopsAutoHunt()
    {
        var player = PlacePlayer(10, 10);
        player.StartAutoHunt(world);

        new MoveEvent { Player = player, Data = "M2" }.Ready(world);

        Assert.False(player.IsAutoHunting);
    }

    [Fact]
    public void WarpTo_StopsAutoHunt()
    {
        var player = PlacePlayer(10, 10);
        player.StartAutoHunt(world);

        player.WarpTo(world, map, 3, 3);

        Assert.False(player.IsAutoHunting);
    }

    [Fact]
    public void StaleEvent_AfterRestart_DoesNothing()
    {
        var player = PlacePlayer(10, 10);
        SpawnNpc(14, 10);
        player.StartAutoHunt(world);
        var stale = player.AutoHuntEvent!;
        player.StopAutoHunt(world, null);
        player.StartAutoHunt(world);

        stale.Ready(world);

        Assert.Equal((10, 10), (player.MapX, player.MapY));
        Assert.NotSame(stale, player.AutoHuntEvent);
    }

    [Fact]
    public void Pause_HoldsPositionAndKeepsSession()
    {
        var player = PlacePlayer(10, 10);
        SpawnNpc(14, 10);
        player.StartAutoHunt(world);
        player.PauseAutoHunt(world);
        player.SendBuffer.Clear();

        for (int i = 0; i < 5; i++) Tick(player, world);

        Assert.True(player.IsAutoHunting);
        Assert.True(player.AutoHuntPaused);
        Assert.Equal((10, 10), (player.MapX, player.MapY));
        Assert.DoesNotContain("SUP", Buffer(player));
    }

    [Fact]
    public void Pause_SendsMessageOnce()
    {
        var player = PlacePlayer(10, 10);
        player.StartAutoHunt(world);
        player.SendBuffer.Clear();

        player.PauseAutoHunt(world);
        player.PauseAutoHunt(world);

        string sent = Buffer(player);
        Assert.Equal(1, CountOf(sent, "Auto-hunt paused."));
    }

    [Fact]
    public void Paused_ManualMoveAndLowHp_DoNotStopIt()
    {
        var player = PlacePlayer(10, 10);
        player.StartAutoHunt(world);
        player.PauseAutoHunt(world);

        new MoveEvent { Player = player, Data = "M2" }.Ready(world);
        player.CurrentHP = 10;
        Tick(player, world);

        Assert.True(player.IsAutoHunting);
        Assert.True(player.AutoHuntPaused);
    }

    [Fact]
    public void Paused_WarpTo_StillStops()
    {
        var player = PlacePlayer(10, 10);
        player.StartAutoHunt(world);
        player.PauseAutoHunt(world);
        player.SendBuffer.Clear();

        player.WarpTo(world, map, 3, 3);

        Assert.False(player.IsAutoHunting);
        Assert.False(player.AutoHuntPaused);
        Assert.Contains("Auto-hunt stopped: you changed location.", Buffer(player));
    }

    [Fact]
    public void Resume_HuntsAroundCurrentSpot()
    {
        var player = PlacePlayer(10, 10);
        player.StartAutoHunt(world);
        player.PauseAutoHunt(world);
        new MoveEvent { Player = player, Data = "M2" }.Ready(world);
        var spot = (player.MapX, player.MapY);
        var near = SpawnNpc(player.MapX + 3, player.MapY);
        player.SendBuffer.Clear();

        player.ResumeAutoHunt(world);
        Tick(player, world);

        Assert.False(player.AutoHuntPaused);
        Assert.Equal(spot, (player.AutoHuntOriginX, player.AutoHuntOriginY));
        Assert.Same(near, player.AutoHuntTarget);
        Assert.Contains("Auto-hunt resumed.", Buffer(player));
    }

    [Fact]
    public void Stop_WhilePaused_ClearsPause()
    {
        var player = PlacePlayer(10, 10);
        player.StartAutoHunt(world);
        player.PauseAutoHunt(world);

        player.StopAutoHunt(world, "turned off.");
        player.StartAutoHunt(world);

        Assert.False(player.AutoHuntPaused);
    }

    private static int CountOf(string haystack, string needle)
    {
        int count = 0, index = 0;
        while ((index = haystack.IndexOf(needle, index, StringComparison.Ordinal)) >= 0)
        {
            count++;
            index += needle.Length;
        }
        return count;
    }
}
