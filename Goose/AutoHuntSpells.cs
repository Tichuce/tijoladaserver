namespace Goose
{
    public enum AutoHuntSpellCategory
    {
        Other = 0,
        Attack,
        Buff,
        Heal,
        Taunt,
    }

    public static class AutoHuntSpells
    {
        private const int FriendlyBits = (int)SpellEffect.SpellEffected.Self | (int)SpellEffect.SpellEffected.Player;

        public static AutoHuntSpellCategory Classify(Spell spell)
        {
            SpellEffect? effect = spell.SpellEffect;
            if (effect is null) return AutoHuntSpellCategory.Other;

            bool hitsNpcs = ((int)effect.Effected & (int)SpellEffect.SpellEffected.NPC) != 0;
            bool friendly = ((int)effect.Effected & FriendlyBits) != 0;
            int hp = FormulaSign(effect.HPFormula);

            if (effect.TauntAggro > 0 && hitsNpcs) return AutoHuntSpellCategory.Taunt;

            switch (effect.EffectType)
            {
                case SpellEffect.EffectTypes.Formula:
                case SpellEffect.EffectTypes.Tick:
                case SpellEffect.EffectTypes.Viral:
                    if (hp < 0 && hitsNpcs) return AutoHuntSpellCategory.Attack;
                    if (hp > 0 && friendly && effect.EffectType == SpellEffect.EffectTypes.Formula) return AutoHuntSpellCategory.Heal;
                    return AutoHuntSpellCategory.Other;
                case SpellEffect.EffectTypes.Stun:
                case SpellEffect.EffectTypes.Root:
                case SpellEffect.EffectTypes.Snare:
                    return hitsNpcs ? AutoHuntSpellCategory.Attack : AutoHuntSpellCategory.Other;
                case SpellEffect.EffectTypes.Buff:
                case SpellEffect.EffectTypes.TickBuff:
                case SpellEffect.EffectTypes.Invisible:
                case SpellEffect.EffectTypes.SeeInvisible:
                case SpellEffect.EffectTypes.OnAttack:
                case SpellEffect.EffectTypes.OnMeleeHit:
                    return effect.Duration > 0 && friendly ? AutoHuntSpellCategory.Buff : AutoHuntSpellCategory.Other;
                default:
                    return AutoHuntSpellCategory.Other;
            }
        }

        public static int FormulaSign(string? formula)
        {
            string text = (formula ?? "").Trim();
            if (text.Length == 0 || text == "0") return 0;
            return text[0] == '-' ? -1 : 1;
        }

        public static string CategoryName(AutoHuntSpellCategory category) => category switch
        {
            AutoHuntSpellCategory.Attack => "attack",
            AutoHuntSpellCategory.Buff => "buff",
            AutoHuntSpellCategory.Heal => "heal",
            AutoHuntSpellCategory.Taunt => "taunt",
            _ => "other",
        };

        public static Spell? Known(Player player, int spellId)
            => FindSlot(player, spellId) is int slot ? player.Spellbook.GetSlot(slot) : null;

        public static int? FindSlot(Player player, int spellId)
        {
            Spellbook? book = player.Spellbook;
            if (book is null || spellId <= 0) return null;

            for (int slot = 1; slot < book.Capacity; slot++)
            {
                if (book.GetSlot(slot)?.ID == spellId) return slot;
            }
            return null;
        }

        public static object Catalog(Player player)
        {
            var spells = new List<object>();
            Spellbook? book = player.Spellbook;
            if (book is not null)
            {
                for (int slot = 1; slot < book.Capacity; slot++)
                {
                    Spell? spell = book.GetSlot(slot);
                    if (spell?.SpellEffect is null) continue;

                    AutoHuntSpellCategory category = Classify(spell);
                    if (category == AutoHuntSpellCategory.Other) continue;

                    SpellEffect effect = spell.SpellEffect;
                    spells.Add(new
                    {
                        slot,
                        id = spell.ID,
                        name = spell.Name,
                        cat = CategoryName(category),
                        tgt = (int)spell.Target,
                        area = (int)effect.TargetType,
                        size = effect.TargetSize,
                        eff = (int)effect.Effected,
                        mp = spell.MPStaticCost,
                        aether = spell.Aether,
                        taunt = effect.TauntAggro,
                        dur = effect.Duration,
                        gfx = spell.Graphic,
                        file = spell.GraphicFile,
                        ok = player.Class is null || player.Class.CanUse(spell.ClassRestrictions),
                    });
                }
            }
            return spells;
        }

        public static IEnumerable<(int X, int Y)> Tiles(SpellEffect effect, int ox, int oy, Direction facing)
        {
            int size = Math.Max(0, effect.TargetSize);
            switch (effect.TargetType)
            {
                case SpellEffect.TargetTypes.Target:
                    yield return (ox, oy);
                    break;
                case SpellEffect.TargetTypes.LineFront:
                    {
                        (int dx, int dy) = Step(facing);
                        for (int i = 1; i <= size; i++)
                            yield return (ox + dx * i, oy + dy * i);
                        break;
                    }
                case SpellEffect.TargetTypes.Cross:
                    for (int y = oy - size; y <= oy + size; y++)
                        for (int x = ox - size; x <= ox + size; x++)
                            if (x == ox - (y - oy) || x == ox + (y - oy))
                                yield return (x, y);
                    break;
                case SpellEffect.TargetTypes.Plus:
                    for (int y = oy - size; y <= oy + size; y++)
                        for (int x = ox - size; x <= ox + size; x++)
                            if (x == ox || y == oy)
                                yield return (x, y);
                    break;
                case SpellEffect.TargetTypes.TriangleFront:
                    for (int i = 1; i <= size; i++)
                    {
                        for (int j = 0; j < i * 2 - 1; j++)
                        {
                            int across = j - (i - 1);
                            yield return facing switch
                            {
                                Direction.Up => (ox + across, oy - i),
                                Direction.Down => (ox + across, oy + i),
                                Direction.Left => (ox - i, oy + across),
                                _ => (ox + i, oy + across),
                            };
                        }
                    }
                    break;
                default:
                    for (int y = oy - size; y <= oy + size; y++)
                        for (int x = ox - size; x <= ox + size; x++)
                            yield return (x, y);
                    break;
            }
        }

        public static bool IsDirectional(SpellEffect effect)
            => effect.TargetType == SpellEffect.TargetTypes.LineFront || effect.TargetType == SpellEffect.TargetTypes.TriangleFront;

        public static (int Dx, int Dy) Step(Direction direction) => direction switch
        {
            Direction.Up => (0, -1),
            Direction.Down => (0, 1),
            Direction.Left => (-1, 0),
            _ => (1, 0),
        };

        public static int Distance(ICharacter a, ICharacter b)
            => Math.Max(Math.Abs(a.MapX - b.MapX), Math.Abs(a.MapY - b.MapY));
    }
}
