namespace Goose.Events
{
    public sealed class AutoHuntCaster
    {
        private const int FailedBuffBackoffSeconds = 30;
        private const int FailedCastBackoffSeconds = 3;

        private static readonly Direction[] AllDirections = [Direction.Up, Direction.Right, Direction.Down, Direction.Left];

        private readonly Player player;
        private readonly GameWorld world;

        public AutoHuntCaster(Player player, GameWorld world)
        {
            this.player = player;
            this.world = world;
        }

        public bool TryHeal(AutoHuntSettings settings)
        {
            if (settings.Heal.Count == 0) return false;

            List<Player> allies = this.Allies();
            foreach (var entry in settings.Heal)
            {
                if (!this.Ready(entry, out int slot, out Spell spell)) continue;

                var injured = allies.Where(a => Below(a, entry.HPPercent)).OrderBy(Percent).ToList();
                if (injured.Count == 0) continue;

                ICharacter? target = this.HealTarget(spell, entry, injured, allies.Count);
                if (target is null) continue;

                if (this.Cast(slot, spell, target))
                {
                    this.player.SetAutoHuntStatus(this.world, "healing", spell.Name + " > " + target.Name);
                    return true;
                }
            }
            return false;
        }

        public bool TryBuff(AutoHuntSettings settings)
        {
            foreach (var entry in settings.Buff)
            {
                if (!this.Ready(entry, out int slot, out Spell spell)) continue;
                if (entry.HPPercent > 0 && Below(this.player, entry.HPPercent)) continue;

                SpellEffect effect = spell.SpellEffect;
                if (spell.Target == Spell.SpellTargets.Target && !effect.CanCastSpell(this.player, this.player)) continue;
                if (this.player.Buffs.Any(b => effect.BuffDoesntStackOver.Contains(b.SpellEffect))) continue;

                Buff? active = this.player.Buffs.FirstOrDefault(b => SameEffect(b.SpellEffect, effect));
                if (active is not null && active.GetDurations(this.world).RemainingMs > entry.RecastSeconds * 1000L) continue;

                if (!this.Cast(slot, spell, this.player))
                {
                    this.Backoff(spell, FailedCastBackoffSeconds);
                    continue;
                }

                if (!this.player.Buffs.Any(b => SameEffect(b.SpellEffect, effect) && b.TimeCast == this.world.TimeNow))
                    this.Backoff(spell, FailedBuffBackoffSeconds);

                this.player.SetAutoHuntStatus(this.world, "casting", spell.Name);
                return true;
            }
            return false;
        }

        public bool TryAttack(AutoHuntSettings settings, NPC target)
        {
            foreach (var entry in settings.Attack)
            {
                if (!this.Ready(entry, out int slot, out Spell spell)) continue;

                var plan = this.AttackPlan(spell, entry, target);
                if (plan is not { } chosen) continue;

                if (chosen.Facing is Direction facing)
                    AutoHuntEvent.Face(this.player, facing, this.world);

                if (!this.Cast(slot, spell, chosen.Target))
                {
                    this.Backoff(spell, FailedCastBackoffSeconds);
                    continue;
                }

                string aim = chosen.Target == this.player ? target.Name : chosen.Target.Name;
                this.player.SetAutoHuntStatus(this.world, "casting", spell.Name + " > " + aim);
                return true;
            }
            return false;
        }

        private ICharacter? HealTarget(Spell spell, AutoHuntSpellEntry entry, List<Player> injured, int allyCount)
        {
            SpellEffect effect = spell.SpellEffect;
            int needed = Math.Min(Math.Max(2, entry.MinTargets), allyCount);

            if (spell.Target == Spell.SpellTargets.Group)
            {
                if (!effect.CanCastSpell(this.player, this.player)) return null;
                return Worth(injured, needed, entry.HPPercent) ? this.player : null;
            }

            if (spell.Target == Spell.SpellTargets.Self)
            {
                if (effect.TargetType == SpellEffect.TargetTypes.Target)
                    return injured.Contains(this.player) && effect.CanCastSpell(this.player, this.player) ? this.player : null;

                var hit = this.HealedBy(effect, this.player.MapX, this.player.MapY, injured);
                return Worth(hit, needed, entry.HPPercent) ? this.player : null;
            }

            var reachable = injured
                .Where(a => AutoHuntSpells.Distance(this.player, a) <= entry.Range && effect.CanCastSpell(this.player, a))
                .ToList();
            if (effect.TargetType == SpellEffect.TargetTypes.Target)
                return reachable.FirstOrDefault();

            Player? centre = null;
            List<Player> best = [];
            foreach (var ally in reachable)
            {
                var hit = this.HealedBy(effect, ally.MapX, ally.MapY, injured);
                if (hit.Count > best.Count)
                {
                    best = hit;
                    centre = ally;
                }
            }
            return centre is not null && Worth(best, needed, entry.HPPercent) ? centre : null;
        }

        private List<Player> HealedBy(SpellEffect effect, int ox, int oy, List<Player> injured)
        {
            var tiles = AutoHuntSpells.Tiles(effect, ox, oy, this.player.Facing).ToHashSet();
            return injured.Where(a => tiles.Contains((a.MapX, a.MapY)) && effect.CanCastSpell(this.player, a)).ToList();
        }

        private static bool Worth(List<Player> hit, int needed, int threshold)
        {
            if (hit.Count == 0) return false;
            return hit.Count >= needed || hit.Min(Percent) * 2 <= threshold;
        }

        private (ICharacter Target, Direction? Facing)? AttackPlan(Spell spell, AutoHuntSpellEntry entry, NPC target)
        {
            SpellEffect effect = spell.SpellEffect;
            int needed = Math.Max(1, entry.MinTargets);
            bool directional = AutoHuntSpells.IsDirectional(effect);
            Direction[] facings = directional ? AllDirections : new[] { this.player.Facing };

            if (spell.Target == Spell.SpellTargets.Group) return null;

            if (spell.Target == Spell.SpellTargets.Self)
            {
                if (effect.TargetType == SpellEffect.TargetTypes.Target) return null;

                (int count, Direction facing) = this.BestFacing(effect, this.player.MapX, this.player.MapY, facings);
                if (count < needed) return null;
                return (this.player, directional ? facing : null);
            }

            if (effect.TargetType == SpellEffect.TargetTypes.Target)
            {
                if (needed > 1) return null;
                if (AutoHuntSpells.Distance(this.player, target) > entry.Range || !effect.CanCastSpell(this.player, target)) return null;
                return (target, null);
            }

            var candidates = new List<NPC> { target };
            candidates.AddRange(this.player.Map.GetNPCsInRange(this.player)
                .Where(n => n != target && AutoHuntEvent.IsHuntable(this.player, n, this.world)));

            NPC? bestCentre = null;
            int bestCount = 0;
            Direction bestFacing = this.player.Facing;
            foreach (var centre in candidates)
            {
                if (AutoHuntSpells.Distance(this.player, centre) > entry.Range || !effect.CanCastSpell(this.player, centre)) continue;

                (int count, Direction facing) = this.BestFacing(effect, centre.MapX, centre.MapY, facings);
                if (count > bestCount)
                {
                    bestCount = count;
                    bestCentre = centre;
                    bestFacing = facing;
                }
            }

            if (bestCentre is null || bestCount < needed) return null;
            return (bestCentre, directional ? bestFacing : null);
        }

        private (int Count, Direction Facing) BestFacing(SpellEffect effect, int ox, int oy, Direction[] facings)
        {
            int bestCount = -1;
            Direction best = facings[0];
            foreach (var facing in facings)
            {
                int count = this.MonstersHit(effect, ox, oy, facing);
                if (count > bestCount)
                {
                    bestCount = count;
                    best = facing;
                }
            }
            return (Math.Max(0, bestCount), best);
        }

        // An area that would also land on another player (PvP maps) is never chosen.
        private int MonstersHit(SpellEffect effect, int ox, int oy, Direction facing)
        {
            int count = 0;
            foreach (var (x, y) in AutoHuntSpells.Tiles(effect, ox, oy, facing))
            {
                ICharacter? character = this.player.Map.GetCharacterAt(x, y);
                if (character is NPC npc)
                {
                    if (npc.State == NPC.States.Alive && npc.NPCType == NPCTemplate.Types.Monster &&
                        (!npc.IsInvisible || this.player.CanSeeInvisible) &&
                        effect.CanCastSpell(this.player, npc))
                        count++;
                }
                else if (character is Player other && other != this.player && effect.CanCastSpell(this.player, other))
                {
                    return 0;
                }
            }
            return effect.OnlyHitsOneNPC ? Math.Min(count, 1) : count;
        }

        private List<Player> Allies()
        {
            var allies = new List<Player> { this.player };
            if (this.player.Group is null) return allies;

            foreach (var member in this.player.Group.Players)
            {
                if (member == this.player || member.Map != this.player.Map || member.State != Player.States.Ready) continue;
                if (member.CurrentHP <= 0 || member.MaxHP <= 0) continue;
                if (Math.Abs(member.MapX - this.player.MapX) >= Map.RANGE_X || Math.Abs(member.MapY - this.player.MapY) >= Map.RANGE_Y) continue;
                allies.Add(member);
            }
            return allies;
        }

        private bool Ready(AutoHuntSpellEntry entry, out int slot, out Spell spell)
        {
            slot = 0;
            spell = null!;
            if (!entry.Enabled) return false;
            if (AutoHuntSpells.FindSlot(this.player, entry.SpellId) is not int found) return false;

            Spell? known = this.player.Spellbook.GetSlot(found);
            if (known?.SpellEffect is null) return false;
            if (!this.player.Class.CanUse(known.ClassRestrictions) && !this.player.HasPrivilege(AccessPrivilege.IgnoreItemRequirements)) return false;
            if (this.player.AutoHuntBackoff.TryGetValue(known.ID, out long until) && this.world.TimeNow < until) return false;

            long cooldown = (long)((known.Aether / 1000.0) * this.world.TimerFrequency);
            if (this.world.TimeNow - this.player.Spellbook.GetSlotLastCast(found) < cooldown) return false;
            if (this.player.CurrentHP <= known.HPStaticCost || this.player.CurrentMP < known.MPStaticCost) return false;
            if (entry.MinMPPercent > 0 && (this.player.MaxMP <= 0 || this.player.CurrentMP * 100 < this.player.MaxMP * entry.MinMPPercent)) return false;
            if (!known.SpellEffect.WorksInPVP && this.player.Map.CanPVP) return false;

            slot = found;
            spell = known;
            return true;
        }

        private bool Cast(int slot, Spell spell, ICharacter target)
        {
            long before = this.player.Spellbook.GetSlotLastCast(slot);
            this.player.CastSpell(slot, target, this.world);
            return this.player.Spellbook.GetSlotLastCast(slot) != before;
        }

        private void Backoff(Spell spell, int seconds)
        {
            this.player.AutoHuntBackoff[spell.ID] = this.world.TimeNow + seconds * this.world.TimerFrequency;
        }

        private static bool SameEffect(SpellEffect a, SpellEffect b) => a == b || a.ID == b.ID;

        private static double Percent(Player p) => p.MaxHP <= 0 ? 100 : p.CurrentHP * 100.0 / p.MaxHP;

        private static bool Below(Player p, int threshold) => p.MaxHP > 0 && p.CurrentHP * 100 < p.MaxHP * threshold;
    }
}
