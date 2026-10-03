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

    public sealed class AutoHuntSettings
    {
        public const string PropertyKey = "autohunt";
        public const int MaxEntries = 10;
        public const int MaxRange = 12;
        public const int DefaultRange = 8;
        public const int MaxDistance = 12;
        public const int MaxEncodedLength = 8192;

        [JsonPropertyName("v")] public int Version { get; set; } = 1;
        [JsonPropertyName("atk")] public List<AutoHuntSpellEntry> Attack { get; set; } = [];
        [JsonPropertyName("buf")] public List<AutoHuntSpellEntry> Buff { get; set; } = [];
        [JsonPropertyName("heal")] public List<AutoHuntSpellEntry> Heal { get; set; } = [];
        [JsonPropertyName("min")] public int MinDistance { get; set; }
        [JsonPropertyName("max")] public int KeepDistance { get; set; } = 1;
        [JsonPropertyName("melee")] public bool Melee { get; set; } = true;

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
            this.Clamp();
        }

        public void Clamp()
        {
            this.Version = 1;
            this.Attack ??= [];
            this.Buff ??= [];
            this.Heal ??= [];
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
