using System.Text.Json;
using System.Text.Json.Serialization;

namespace Goose
{
    public sealed class AutoHuntSpellEntry
    {
        [JsonPropertyName("id")] public int SpellId { get; set; }
        [JsonPropertyName("on")] public bool Enabled { get; set; } = true;
        [JsonPropertyName("mp")] public int MinMPPercent { get; set; }
        [JsonPropertyName("hp")] public int HPPercent { get; set; }
        [JsonPropertyName("rng")] public int Range { get; set; } = AutoHuntSettings.DefaultRange;
        [JsonPropertyName("aoe")] public int MinTargets { get; set; } = 1;
        [JsonPropertyName("re")] public int RecastSeconds { get; set; }
    }

    public sealed class AutoHuntTauntSettings
    {
        public const int MaxSlots = 2;

        [JsonPropertyName("on")] public bool Enabled { get; set; }
        [JsonPropertyName("st")] public List<int> Single { get; set; } = [];
        [JsonPropertyName("area")] public List<int> Area { get; set; } = [];
        [JsonPropertyName("pull")] public bool Pull { get; set; } = true;
        [JsonPropertyName("rad")] public int Radius { get; set; } = 8;
        [JsonPropertyName("want")] public int Desired { get; set; } = 4;
        [JsonPropertyName("cap")] public int Maximum { get; set; } = 6;
        [JsonPropertyName("min")] public int MinDistance { get; set; } = 2;
        [JsonPropertyName("max")] public int MaxDistance { get; set; } = 6;
        [JsonPropertyName("amin")] public int AreaMinimum { get; set; } = 2;
        [JsonPropertyName("re")] public int RetauntSeconds { get; set; } = 8;

        public void Clamp()
        {
            this.Single = Distinct(this.Single, MaxSlots);
            this.Area = Distinct(this.Area, MaxSlots);
            this.Radius = Math.Clamp(this.Radius, 1, 20);
            this.Desired = Math.Clamp(this.Desired, 1, 20);
            this.Maximum = Math.Clamp(this.Maximum, this.Desired, 30);
            this.MaxDistance = Math.Clamp(this.MaxDistance, 1, AutoHuntSettings.MaxRange);
            this.MinDistance = Math.Clamp(this.MinDistance, 0, this.MaxDistance);
            this.AreaMinimum = Math.Clamp(this.AreaMinimum, 1, 9);
            this.RetauntSeconds = Math.Clamp(this.RetauntSeconds, 0, 120);
        }

        public static List<int> Distinct(List<int>? ids, int max)
            => (ids ?? []).Where(id => id > 0).Distinct().Take(max).ToList();
    }

    public sealed class AutoHuntSettings
    {
        public const string PropertyKey = "autohunt";
        public const int MaxEntries = 10;
        public const int MaxRange = 12;
        public const int DefaultRange = 8;
        public const int MaxDistance = 12;
        public const int MaxEncodedLength = 8192;
        public const int MaxMonsters = 30;

        [JsonPropertyName("v")] public int Version { get; set; } = 1;
        [JsonPropertyName("atk")] public List<AutoHuntSpellEntry> Attack { get; set; } = [];
        [JsonPropertyName("buf")] public List<AutoHuntSpellEntry> Buff { get; set; } = [];
        [JsonPropertyName("heal")] public List<AutoHuntSpellEntry> Heal { get; set; } = [];
        [JsonPropertyName("min")] public int MinDistance { get; set; }
        [JsonPropertyName("max")] public int KeepDistance { get; set; } = 1;
        [JsonPropertyName("melee")] public bool Melee { get; set; } = true;
        [JsonPropertyName("mt")] public AutoHuntTauntSettings Taunt { get; set; } = new();
        [JsonPropertyName("pri")] public List<int> PriorityMonsters { get; set; } = [];
        [JsonPropertyName("ign")] public List<int> IgnoredMonsters { get; set; } = [];

        public static AutoHuntSettings For(Player player)
        {
            if (player.AutoHuntSettingsCache is not null) return player.AutoHuntSettingsCache;

            AutoHuntSettings settings = new();
            if (player.Properties.TryGetValue(PropertyKey, out object? raw) && raw is string json && json.Length > 0)
            {
                try
                {
                    settings = JsonHelper.Deserialize<AutoHuntSettings>(json) ?? new AutoHuntSettings();
                }
                catch (JsonException)
                {
                    settings = new AutoHuntSettings();
                }
            }

            settings.Clamp();
            player.AutoHuntSettingsCache = settings;
            return settings;
        }

        public static void Store(Player player, AutoHuntSettings settings)
        {
            player.Properties[PropertyKey] = JsonHelper.Serialize(settings);
            player.AutoHuntSettingsCache = settings;
        }

        public static void Reset(Player player)
        {
            player.Properties.Remove(PropertyKey);
            player.AutoHuntSettingsCache = null;
        }

        public static AutoHuntSettings? Parse(string json)
        {
            try
            {
                return JsonHelper.Deserialize<AutoHuntSettings>(json);
            }
            catch (JsonException)
            {
                return null;
            }
        }

        public static bool TryApply(Player player, GameWorld world, string encoded)
        {
            if (encoded.Length == 0 || encoded.Length > MaxEncodedLength
                || !ProtocolTextCodec.TryDecodeText(encoded, MaxEncodedLength, out string json)
                || Parse(json) is not { } settings)
                return false;

            settings.Validate(player, world);
            Store(player, settings);
            return true;
        }

        public static string ConfigJson(Player player, GameWorld world)
        {
            return JsonHelper.Serialize(new
            {
                cfg = For(player),
                spells = AutoHuntSpells.Catalog(player),
                mobs = AutoHuntSpells.MonstersOnMap(player),
                radius = world.Settings.AutoHuntRadius,
                minhp = world.Settings.AutoHuntMinHPPercent,
                step = world.Settings.AutoHuntStepMilliseconds,
            });
        }

        public void Validate(Player player, GameWorld world)
        {
            this.Attack = Filter(this.Attack, player, world, AutoHuntSpellCategory.Attack);
            this.Buff = Filter(this.Buff, player, world, AutoHuntSpellCategory.Buff);
            this.Heal = Filter(this.Heal, player, world, AutoHuntSpellCategory.Heal);
            this.Taunt ??= new AutoHuntTauntSettings();
            this.Taunt.Single = FilterTaunts(this.Taunt.Single, player, world, area: false);
            this.Taunt.Area = FilterTaunts(this.Taunt.Area, player, world, area: true);
            this.Clamp();
        }

        public void Clamp()
        {
            this.Version = 1;
            this.Attack ??= [];
            this.Buff ??= [];
            this.Heal ??= [];
            this.Attack.RemoveAll(e => e is null);
            this.Buff.RemoveAll(e => e is null);
            this.Heal.RemoveAll(e => e is null);
            foreach (var entry in this.Attack.Concat(this.Buff).Concat(this.Heal))
            {
                entry.MinMPPercent = Math.Clamp(entry.MinMPPercent, 0, 100);
                entry.HPPercent = Math.Clamp(entry.HPPercent, 0, 100);
                entry.Range = Math.Clamp(entry.Range, 1, MaxRange);
                entry.MinTargets = Math.Clamp(entry.MinTargets, 1, 9);
                entry.RecastSeconds = Math.Clamp(entry.RecastSeconds, 0, 600);
            }
            this.KeepDistance = Math.Clamp(this.KeepDistance, 1, MaxDistance);
            this.MinDistance = Math.Clamp(this.MinDistance, 0, this.KeepDistance);
            this.Taunt ??= new AutoHuntTauntSettings();
            this.Taunt.Clamp();
            this.IgnoredMonsters = AutoHuntTauntSettings.Distinct(this.IgnoredMonsters, MaxMonsters);
            this.PriorityMonsters = AutoHuntTauntSettings.Distinct(this.PriorityMonsters, MaxMonsters)
                .Where(id => !this.IgnoredMonsters.Contains(id)).ToList();
        }

        public bool IsIgnored(NPC npc) => this.IgnoredMonsters.Contains(npc.NPCTemplateID);

        public int PriorityOf(NPC npc)
        {
            int index = this.PriorityMonsters.IndexOf(npc.NPCTemplateID);
            return index < 0 ? int.MaxValue : index;
        }

        private static List<int> FilterTaunts(List<int>? ids, Player player, GameWorld world, bool area)
        {
            var result = new List<int>();
            foreach (int id in AutoHuntTauntSettings.Distinct(ids, AutoHuntTauntSettings.MaxSlots))
            {
                Spell? spell = AutoHuntSpells.Known(player, id) ?? world.SpellHandler.GetSpell(id);
                if (spell is null || AutoHuntSpells.Classify(spell) != AutoHuntSpellCategory.Taunt) continue;
                if (AutoHuntSpells.IsAreaTaunt(spell) != area) continue;
                result.Add(id);
            }
            return result;
        }

        private static List<AutoHuntSpellEntry> Filter(List<AutoHuntSpellEntry>? entries, Player player, GameWorld world, AutoHuntSpellCategory category)
        {
            var result = new List<AutoHuntSpellEntry>();
            if (entries is null) return result;

            foreach (var entry in entries)
            {
                if (entry is null || result.Count >= MaxEntries) continue;
                if (result.Any(e => e.SpellId == entry.SpellId)) continue;

                Spell? spell = AutoHuntSpells.Known(player, entry.SpellId) ?? world.SpellHandler.GetSpell(entry.SpellId);
                if (spell is null || AutoHuntSpells.Classify(spell) != category) continue;

                result.Add(entry);
            }
            return result;
        }
    }
}
