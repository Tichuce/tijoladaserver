using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using AsperetaClient.Scripting.GameData;

namespace AsperetaClient.Scripting.GameState;

public class GameState
{
    public Spellbook Spellbook { get; init; } = new();
    public Map Map { get; init; }
    public Character Player { get; private set; }
    public PlayerStats Stats { get; init; } = new();
    public Group Group { get; init; } = new();
    public Buffs Buffs { get; init; } = new();
    public Inventory Inventory { get; init; } = new();
    public GameDatabase GameDatabase { get; init; } = new();

    public GameState()
    {
        GameClient.NetworkClient.PacketManager.Listen<SetYourCharacterPacket>(OnSetYourCharacter);

        Map = new Map(this);
    }

    private void OnSetYourCharacter(object packet)
    {
        var p = (SetYourCharacterPacket)packet;
        
        if (Map.Characters.TryGetValue(p.LoginId, out var character))
            Player = character;
        else
            Console.WriteLine($"Character to set not found");
    }

    public IEnumerable<Character> GetGroupMembers()
    {
        var groupMembers = Group.MemberLoginIds.TakeWhile(c => c != 0).ToArray();

        return Map.Characters.Values.Where(c => groupMembers.Contains(c.LoginId));
    }

    public void SellItem(int npcId, Item item)
    {
        GameClient.NetworkClient.VendorSellItem(npcId, item.SlotNumber, item.StackSize);
    }

    public void BuyItem(int npcId, int slotNumber)
    {
        GameClient.NetworkClient.VendorPurchaseItem(npcId, slotNumber);
    }
}

public class Spellbook
{
    private const int MaxSpells = 30;
    private Spell[] spells = new Spell[MaxSpells];

    public Spellbook()
    {
        GameClient.NetworkClient.PacketManager.Listen<SpellbookSlotPacket>(OnSpellbookSlot);
    }

    public void OnSpellbookSlot(object packet)
    {
        var p = (SpellbookSlotPacket)packet;

        spells[p.SlotNumber] = p.SpellName is null ? null : new Spell(p);
    }

    public Spell Find(string name)
    {
        return spells.FirstOrDefault(s => s?.Name == name);
    }
}

public class Spell
{
    public int SlotNumber { get; private set; }

    public string Name { get; private set; }

    public int Unknown1 { get; private set; }

    public int Unknown2 { get; private set; }

    public bool Targetable { get; private set; }

    public int Graphic { get; private set; }

    public DateTime LastCastTimeUtc { get; private set; }

    public TimeSpan Cooldown { get; set; }

    public TimeSpan CooldownRemaining => TimeSpan.FromMilliseconds(Math.Max(0, (this.Cooldown - (DateTime.UtcNow - this.LastCastTimeUtc)).TotalMilliseconds));

    public bool CanCast => DateTime.UtcNow - this.LastCastTimeUtc >= this.Cooldown;

    public int HPCost { get; set; }
    public int MPCost { get; set; }
    public TimeSpan Duration { get; set;}

    public Spell(SpellbookSlotPacket spellSlotPacket)
    {
        this.SlotNumber = spellSlotPacket.SlotNumber;
        this.Name = spellSlotPacket.SpellName;
        this.Unknown1 = spellSlotPacket.Unknown1;
        this.Unknown2 = spellSlotPacket.Unknown2;
        this.Targetable = spellSlotPacket.Targetable;
        this.Graphic = spellSlotPacket.Graphic;
        this.LastCastTimeUtc = DateTime.UtcNow.AddDays(-5);
        this.Cooldown = TimeSpan.FromSeconds(0);
    }

    public bool Cast(AsperetaClient.Character target)
    {
        if (!CanCast || target.Erased)
            return false;

        GameClient.NetworkClient.Cast(this.SlotNumber, target.LoginId);
        this.LastCastTimeUtc = DateTime.UtcNow;

        return true;
    }

    public bool Cast(Character target)
    {
        if (!CanCast)
            return false;

        GameClient.NetworkClient.Cast(this.SlotNumber, target.LoginId);
        this.LastCastTimeUtc = DateTime.UtcNow;

        return true;
    }


    public void SetCooldown(TimeSpan cooldown)
    {
        this.Cooldown = cooldown;
    }
}

public class MapTile
{
    public bool Blocked { get; }

    public Character Character { get; set; }

    public WarpTile Warp { get; }

    public bool IsWalkable => !Blocked && Character is null && Warp is null;

    public MapTile(bool blocked, WarpTile warpTile)
    {
        Blocked = blocked;
        Warp = warpTile;
    }
}

internal record Position(int X, int Y);

public class Map
{
    public string Name { get; private set; }
    public int MapNumber { get; private set; }
    public ConcurrentDictionary<int, Character> Characters { get; init; } = new();

    public int Width { get; private set; }
    public int Height { get; private set; }

    public MapTile[] Tiles { get; private set; }

    private GameState gameState;
    private DateTime lastMoveTime = DateTime.MinValue;
    private TimeSpan moveSpeedPerTile = TimeSpan.FromMilliseconds(320);
    private TimeSpan attackDelay = TimeSpan.FromSeconds(1);
    private DateTime lastAttackTime = DateTime.MinValue;

    private Position[] directionOffsets = [new(0, -1), new(1, 0), new(0, 1), new(-1, 0)];

    public Map(GameState gameState)
    {
        GameClient.NetworkClient.PacketManager.Listen<SendCurrentMapPacket>(OnSendCurrentMap);
        GameClient.NetworkClient.PacketManager.Listen<MakeCharacterPacket>(OnMakeCharacter);
        GameClient.NetworkClient.PacketManager.Listen<EraseCharacterPacket>(OnEraseCharacter);
        GameClient.NetworkClient.PacketManager.Listen<VitalsPercentagePacket>(OnVitalsPercentage);
        GameClient.NetworkClient.PacketManager.Listen<MoveCharacterPacket>(OnMoveCharacter);
        GameClient.NetworkClient.PacketManager.Listen<ChangeHeadingPacket>(OnChangeHeading);
        GameClient.NetworkClient.PacketManager.Listen<WeaponSpeedPacket>(OnWeaponSpeed);
        GameClient.NetworkClient.PacketManager.Listen<SetYourPositionPacket>(OnSetYourPosition);
        GameClient.NetworkClient.PacketManager.Listen<GroupUpdatePacket>(OnGroupUpdate);

        this.gameState = gameState;
    }

    public MapTile this[int x, int y]
    {
        get { return this.Tiles[y * this.Width + x]; }
    }

    public Character GetCharacter(int x, int y)
    {
        if (x < 0 || x >= this.Width || y < 0 || y >= this.Height)
            return null;

        return this[x, y].Character;
    }

    public MapTile GetTile(int x, int y)
    {
        if (x < 0 || x >= this.Width || y < 0 || y >= this.Height)
            return null;

        return this[x, y];
    }

    public bool CanAttack()
    {
        return DateTime.UtcNow - lastAttackTime >= attackDelay;
    }

    public bool Attack()
    {
        if (!CanAttack())
            return false;

        GameClient.NetworkClient.PacketManager.Handle($"ATT{gameState.Player.LoginId}");

        GameClient.NetworkClient.Attack();

        lastAttackTime = DateTime.UtcNow;

        return true;
    }

    public bool CanMove()
    {
        return DateTime.UtcNow - lastMoveTime >= moveSpeedPerTile;
    }

    public (Character character, int distance) GetClosestMonster(IReadOnlyCollection<string> filterNames = null)
    {
        Character closestCharacter = null;
        int closestDistance = int.MaxValue;

        foreach (var character in Characters.Values)
        {
            if (character.CharacterType != CharacterType.Monster)
                continue;

            if (filterNames != null && !filterNames.Contains(character.Name))
                continue;

            var distance = DistanceTo(character);
            if (distance < closestDistance || distance == closestDistance && character.HPPercent < closestCharacter.HPPercent)
            {
                closestCharacter = character;
                closestDistance = distance;
            }
        }

        return (closestCharacter, closestDistance);
    }

    public IReadOnlyCollection<Character> GetMonsters()
    {
        return Characters.Values.Where(c => c.CharacterType == CharacterType.Monster).ToArray();
    }

    public Character GetCharacter(string name)
    {
        return Characters.Values.FirstOrDefault(c => c.Name == name);
    }

    public int DistanceTo(Character character)
    {
        return DistanceBetween(gameState.Player, character);
    }

    public int DistanceTo(int x, int y)
    {
        return DistanceBetween(gameState.Player.X, gameState.Player.Y, x, y);
    }

    public int DistanceBetween(Character a, Character b)
    {
        return DistanceBetween(a.X, a.Y, b.X, b.Y);
    }

    public int DistanceBetween(int x1, int y1, int x2, int y2)
    {
        return Math.Abs(x1 - x2) + Math.Abs(y1 - y2);
    }

    public void Face(Character character)
    {
        var xDist = gameState.Player.X - character.X;
        var yDist = gameState.Player.Y - character.Y;

        if (Math.Abs(yDist) > Math.Abs(xDist))
        {
            if (yDist > 0)
                Face(Direction.Up);
            else
                Face(Direction.Down);
        }
        else
        {
            if (xDist > 0)
                Face(Direction.Left);
            else
                Face(Direction.Right);
        }
    }

    public void Face(Direction direction)
    {
        // Facing is inconsistent, I think when walking into something it breaks, so this check isn't good
        //if (gameState.Player.Facing == direction)
        //    return;

        // Bit of a hack, easiest way to keep client and script state in sync by simulating a CHH packet being received
        GameClient.NetworkClient.PacketManager.Handle($"CHH{gameState.Player.LoginId},{((int)direction) + 1}");

        GameClient.NetworkClient.Facing(direction);
    }

    public bool Move(Direction direction)
    {
        var offset = directionOffsets[(int)direction];
        var position = new Position(gameState.Player.X + offset.X, gameState.Player.Y + offset.Y);

        return Move(direction, position);
    }

    private bool Move(Direction direction, Position position)
    {
        if (!CanMove())
            return false;

        // Bit of a hack, easiest way to keep client and script state in sync by simulating a move packet being received
        GameClient.NetworkClient.PacketManager.Handle($"MOC{gameState.Player.LoginId},{position.X + 1},{position.Y + 1}");

        GameClient.NetworkClient.Move(direction);

        gameState.Player.Facing = direction;

        lastMoveTime = DateTime.UtcNow;

        return true;
    }

    public bool MoveTowards(Character character)
    {
        return MoveTowards(character.X, character.Y);
    }

    public bool MoveTowards(int x, int y)
    {
        if (!CanMove())
            return false;

        var nextPos = MoveTowardsPosition(new Position(gameState.Player.X, gameState.Player.Y), new Position(x, y));
        if (nextPos is null)
            return false;

        if (nextPos.Y < gameState.Player.Y)
            return Move(Direction.Up);
        else if (nextPos.X > gameState.Player.X)
            return Move(Direction.Right);
        else if (nextPos.Y > gameState.Player.Y)
            return Move(Direction.Down);
        else if (nextPos.X < gameState.Player.X)
            return Move(Direction.Left);

        return false;
    }

    private Position NextPosition(Dictionary<Position, Position> cameFrom, Position endPosition)
    {
        var path = new List<Position>();

        var current = endPosition;
        while (current != null)
        {
            path.Add(current);
            current = cameFrom[current];
        }

        if (path.Count >= 2)
            return path[^2];

        return null;
    }

    private IEnumerable<Position> GetAdjacentFreePositions(Position fromPosition, Position endPosition)
    {
        foreach (var offset in directionOffsets)
        {
            var position = new Position(fromPosition.X + offset.X, fromPosition.Y + offset.Y);

            if (position.X < 0 || position.X >= Width || position.Y < 0 || position.Y >= Height)
                continue;

            var tile = this[position.X, position.Y];
            if (position != endPosition && !tile.IsWalkable)
                continue;

            yield return position;
        }
    }

    private Position MoveTowardsPosition(Position startPosition, Position endPosition)
    {
        var openSet = new PriorityQueue<Position, int>();
        var cameFrom = new Dictionary<Position, Position>();
        var gScores = new Dictionary<Position, int>();

        openSet.Enqueue(startPosition, 0);
        cameFrom[startPosition] = null;
        gScores[startPosition] = 0;

        while (openSet.Count > 0)
        {
            var current = openSet.Dequeue();
            if (current == endPosition)
                return NextPosition(cameFrom, endPosition);

            foreach (var adjacent in GetAdjacentFreePositions(current, endPosition))
            {
                var tentativeGScore = gScores[current] + 1;

                if (gScores.TryGetValue(adjacent, out var gScore) && tentativeGScore >= gScore)
                    continue;

                cameFrom[adjacent] = current;
                gScores[adjacent] = tentativeGScore;

                if (!openSet.UnorderedItems.Any(x => x.Element == adjacent))
                    openSet.Enqueue(adjacent, tentativeGScore + AStarHeuristic(adjacent, endPosition));
            }
        }

        return null;
    }

    private int AStarHeuristic(Position a, Position b)
    {
        return (int)Math.Pow(a.X - b.X, 2) + (int)Math.Pow(a.Y - b.Y, 2);
    }

    private void OnSendCurrentMap(object packet)
    {
        var p = (SendCurrentMapPacket)packet;

        Name = p.MapName;
        MapNumber = p.MapNumber;

        var mapData = AsperetaMapLoader.Load(MapNumber);
        Width = mapData.Width;
        Height = mapData.Height;

        var warpTiles = gameState.GameDatabase.GetWarpTiles(MapNumber, Name);

        var tiles = new MapTile[Width * Height];
        for (int y = 0; y < Height; y++)
        {
            for (var x = 0; x < Width; x++)
            {
                var warp = warpTiles.FirstOrDefault(w => w.X == x && w.Y == y);
                var blocked = mapData[x, y].Blocked;

                tiles[y * Width + x] = new MapTile(blocked, warp);
            }
        }

        Tiles = tiles;

        Characters.Clear();
    }

    private void OnMakeCharacter(object packet)
    {
        var p = (MakeCharacterPacket)packet;

        var character = new Character(p);
        Characters[p.LoginId] = character;

        this[character.X, character.Y].Character = character;
    }

    private void OnEraseCharacter(object packet)
    {
        var p = (EraseCharacterPacket)packet;

        if (Characters.TryRemove(p.LoginId, out var character))
        {
            if (this[character.X, character.Y].Character == character)
                this[character.X, character.Y].Character = null;
        }
    }

    private void OnVitalsPercentage(object packet)
    {
        var p = (VitalsPercentagePacket)packet;

        if (Characters.TryGetValue(p.LoginId, out var character))
            character.OnVitalsPercentage(p);
    }

    private void OnMoveCharacter(object packet)
    {
        var p = (MoveCharacterPacket)packet;

        if (Characters.TryGetValue(p.LoginId, out var character))
        {
            this[character.X, character.Y].Character = null;
            this[p.MapX, p.MapY].Character = character;

            character.OnMoveCharacter(p);
        }
    }

    private void OnChangeHeading(object packet)
    {
        var p = (ChangeHeadingPacket)packet;

        if (Characters.TryGetValue(p.LoginId, out var character))
            character.OnChangeHeading(p);
    }

    private void OnWeaponSpeed(object packet)
    {
        var p = (WeaponSpeedPacket)packet;

        attackDelay = TimeSpan.FromMilliseconds(p.Speed);
    }

    private void OnSetYourPosition(object packet)
    {
        var p = (SetYourPositionPacket)packet;

        if (this[gameState.Player.X, gameState.Player.Y].Character == gameState.Player)
            this[gameState.Player.X, gameState.Player.Y].Character = null;
        this[p.MapX, p.MapY].Character = gameState.Player;

        gameState.Player.OnSetYourPosition(p);
    }

    private void OnGroupUpdate(object packet)
    {
        var p = (GroupUpdatePacket)packet;
        if (p.LoginId == 0)
            return;

        if (Characters.TryGetValue(p.LoginId, out var character))
            character.ClassName = p.ClassName;
    }
}

public enum CharacterType
{
    Player = 1,
    Monster = 2,
    Vendor = 10,
    Banker = 11,
    Quest = 12
}

public class Character
{
    public int LoginId { get; private set; }
    public CharacterType CharacterType { get; private set; }
    public string Name { get; private set; }
    public int X { get; private set; }
    public int Y { get; private set; }
    public int HPPercent { get; private set; }
    public int MPPercent { get; private set; }
    public Direction Facing { get; set; }
    public string ClassName { get; set; }
    public DateTime SpawnTime { get; private set; }

    public Character(MakeCharacterPacket packet)
    {
        LoginId = packet.LoginId;
        CharacterType = (CharacterType)packet.CharacterType;
        Name = packet.Name;
        X = packet.MapX;
        Y = packet.MapY;
        HPPercent = packet.HPPercent;
        MPPercent = 100;
        Facing = (Direction)packet.Facing;
        SpawnTime = DateTime.UtcNow;
    }

    public void OnVitalsPercentage(VitalsPercentagePacket packet)
    {
        HPPercent = packet.HPPercentage;
        MPPercent = packet.MPPercentage;
    }

    public void OnMoveCharacter(MoveCharacterPacket packet)
    {
        X = packet.MapX;
        Y = packet.MapY;
    }

    public void OnChangeHeading(ChangeHeadingPacket packet)
    {
        Facing = (Direction)packet.Facing;
    }

    public void OnSetYourPosition(SetYourPositionPacket packet)
    {
        X = packet.MapX;
        Y = packet.MapY;
    }
}

public class PlayerStats
{
    public string ClassName { get; private set; }
    public int Level { get; private set; }
    public long MaxHP { get; private set; }
    public long MaxMP { get; private set; }
    public long MaxSP { get; private set; }
    public long CurrentHP { get; private set; }

    public long CurrentMP
    {
        get
        {
            return Interlocked.CompareExchange(ref _currentMp, 0, 0);
        }
    }

    public long CurrentSP { get; private set; }
    public DateTime LastUpdate 
    {
        get
        {
            long lastUpdate = Interlocked.CompareExchange(ref _lastUpdate, 0, 0);
            return DateTime.FromBinary(lastUpdate);
        }
    }

    private long _lastUpdate;
    private long _currentMp;

    public double HPPercent => (double)CurrentHP / MaxHP;
    public double MPPercent => (double)CurrentMP / MaxMP;

    public PlayerStats()
    {
        GameClient.NetworkClient.PacketManager.Listen<StatusInfoPacket>(OnStatusInfo);
    }

    public void OnStatusInfo(object packet)
    {
        var p = (StatusInfoPacket)packet;

        this.ClassName = p.ClassName;
        this.Level = p.Level;
        this.MaxHP = p.MaxHP;
        this.MaxMP = p.MaxMP;
        this.MaxSP = p.MaxSP;
        this.CurrentHP = p.CurrentHP;
        this.CurrentSP = p.CurrentSP;
        
        Interlocked.Exchange(ref _currentMp, p.CurrentMP);
        Interlocked.Exchange(ref _lastUpdate, DateTime.UtcNow.ToBinary());
    }
}

public class Group
{
    private const int MaxMembers = 10;

    public int[] MemberLoginIds { get; init; } = new int[MaxMembers];

    public Group()
    {
        GameClient.NetworkClient.PacketManager.Listen<GroupUpdatePacket>(OnGroupUpdate);
    }

    private void OnGroupUpdate(object packet)
    {
        var p = (GroupUpdatePacket)packet;

        if (p.LineNumber > MaxMembers) return;

        MemberLoginIds[p.LineNumber] = p.LoginId;
    }
}

public class Buffs
{
    private const int MaxBuffs = 50;

    public string[] Active { get; init; } = new string[MaxBuffs];

    public Buffs()
    {
        GameClient.NetworkClient.PacketManager.Listen<BuffBarPacket>(OnBuffBar);
    }

    private void OnBuffBar(object packet)
    {
        var p = (BuffBarPacket)packet;

        if (p.SlotNumber > MaxBuffs) return;

        Active[p.SlotNumber] = p.Name;
    }
}

public class Inventory
{
    private const int MaxItems = 30;
    private Item[] items = new Item[MaxItems];

    public Inventory()
    {
        GameClient.NetworkClient.PacketManager.Listen<InventorySlotPacket>(OnInventorySlot);
    }

    public void OnInventorySlot(object packet)
    {
        var p = (InventorySlotPacket)packet;

        items[p.SlotNumber] = p.ItemName is null ? null : new Item(p);
    }

    public Item Find(string name)
    {
        return items.FirstOrDefault(s => s?.Name == name);
    }

    public IEnumerable<Item> All()
    {
        return items.Where(i => i is not null);
    }
}

public class Item
{
    public int SlotNumber { get; init; }

    public int ItemId { get; init; }

    public string Name { get; init; }

    public int StackSize { get; init; }

    public Item(InventorySlotPacket packet)
    {
        SlotNumber = packet.SlotNumber;
        ItemId = packet.ItemId;
        Name = packet.ItemName;
        StackSize = packet.StackSize;
    }
}