namespace Goose.Events
{
    public sealed class AutoHuntPuller
    {
        private const int DoubleTauntGuardSeconds = 3;
        private const int MaxFailedSteps = 6;

        private readonly Player player;
        private readonly GameWorld world;
        private readonly AutoHuntCaster caster;
        private readonly AutoHuntSettings settings;
        private readonly AutoHuntTauntSettings mt;

        public AutoHuntPuller(Player player, GameWorld world, AutoHuntCaster caster, AutoHuntSettings settings)
        {
            this.player = player;
            this.world = world;
            this.caster = caster;
            this.settings = settings;
            this.mt = settings.Taunt;
        }

        public bool TryTaunt(bool rooted)
        {
            if (!this.mt.Enabled || (this.mt.Single.Count == 0 && this.mt.Area.Count == 0)) return false;

            this.Prune();
            var nearby = this.Nearby();
            if (nearby.Count == 0) return false;

            int group = nearby.Count(n => n.AggroTarget == this.player);
            if (this.TryAreaTaunt(group)) return true;
            if (this.TryRescue(nearby)) return true;
            if (this.mt.Pull && group < this.mt.Desired && group < this.mt.Maximum && this.TryPull(nearby, group, rooted)) return true;
            return false;
        }

        public static bool ShouldWaitForPull(Player player, NPC target, AutoHuntSettings settings)
        {
            var mt = settings.Taunt;
            if (!mt.Enabled || !mt.Pull || target.AggroTarget != player || target.MoveSpeed <= 0) return false;
            return player.AutoHuntWaitTicks++ < 10;
        }

        private List<NPC> Nearby()
        {
            return this.player.Map.GetNPCsInRange(this.player)
                .Where(n => AutoHuntEvent.IsHuntable(this.player, n, this.world) &&
                    !this.settings.IsIgnored(n) &&
                    !this.player.AutoHuntIgnored.Contains(n) &&
                    AutoHuntSpells.Distance(this.player, n) <= this.mt.Radius)
                .ToList();
        }

        private bool TryAreaTaunt(int group)
        {
            int room = Math.Max(0, this.mt.Maximum - group);
            foreach (int id in this.mt.Area)
            {
                if (!this.caster.ReadySpell(id, 0, out int slot, out Spell spell)) continue;

                var plan = this.caster.AreaPlan(spell, this.mt.MaxDistance, null,
                    n => !this.settings.IsIgnored(n) && this.NeedsTaunt(n) && !this.Recently(n));
                if (plan is not { } chosen || chosen.Hit.Count < this.mt.AreaMinimum) continue;
                if (chosen.Hit.Count(n => n.AggroTarget != this.player) > room) continue;

                if (chosen.Facing is Direction facing)
                    AutoHuntEvent.Face(this.player, facing, this.world);

                if (!this.caster.Cast(slot, spell, chosen.Target))
                {
                    this.caster.Backoff(spell, 3);
                    continue;
                }

                foreach (var npc in chosen.Hit) this.Mark(npc);
                this.player.SetAutoHuntStatus(this.world, "pulling", $"{spell.Name} x{chosen.Hit.Count}");
                return true;
            }
            return false;
        }

        private bool TryRescue(List<NPC> nearby)
        {
            var lost = nearby
                .Where(n => n.AggroTarget is not null && n.AggroTarget != this.player &&
                    (this.player.AutoHuntTaunted.ContainsKey(n) || this.IsAlly(n.AggroTarget)) &&
                    !this.Recently(n) &&
                    AutoHuntSpells.Distance(this.player, n) <= this.mt.MaxDistance)
                .OrderBy(n => this.settings.PriorityOf(n))
                .ThenBy(n => AutoHuntSpells.Distance(this.player, n));

            foreach (var npc in lost)
            {
                if (this.TrySingle(npc, "rescue")) return true;
            }
            return false;
        }

        private bool TryPull(List<NPC> nearby, int group, bool rooted)
        {
            var pick = nearby
                .Where(n => n.AggroTarget != this.player && !this.Recently(n) &&
                    AutoHuntSpells.Distance(this.player, n) >= this.mt.MinDistance)
                .OrderBy(n => this.settings.PriorityOf(n))
                .ThenBy(n => AutoHuntSpells.Distance(this.player, n))
                .FirstOrDefault();
            if (pick is null) return false;

            if (AutoHuntSpells.Distance(this.player, pick) <= this.mt.MaxDistance)
                return this.TrySingle(pick, $"{group + 1}/{this.mt.Desired}");

            if (rooted || this.mt.Single.Count == 0) return false;

            bool moved = AutoHuntEvent.StepToward(this.player, pick.MapX, pick.MapY, this.world);
            this.player.AutoHuntFailedSteps = moved ? 0 : this.player.AutoHuntFailedSteps + 1;
            if (this.player.AutoHuntFailedSteps >= MaxFailedSteps)
            {
                this.player.AutoHuntIgnored.Add(pick);
                this.player.AutoHuntFailedSteps = 0;
            }
            this.player.SetAutoHuntStatus(this.world, "pulling", "Approaching " + pick.Name);
            return true;
        }

        private bool TrySingle(NPC npc, string label)
        {
            if (AutoHuntSpells.Distance(this.player, npc) > this.mt.MaxDistance) return false;

            foreach (int id in this.mt.Single)
            {
                if (!this.caster.ReadySpell(id, 0, out int slot, out Spell spell)) continue;
                if (!spell.SpellEffect.CanCastSpell(this.player, npc)) continue;

                if (!this.caster.Cast(slot, spell, npc))
                {
                    this.caster.Backoff(spell, 3);
                    continue;
                }

                this.Mark(npc);
                this.player.SetAutoHuntStatus(this.world, "pulling", $"{spell.Name} > {npc.Name} ({label})");
                return true;
            }
            return false;
        }

        private bool NeedsTaunt(NPC npc)
        {
            if (npc.AggroTarget != this.player) return true;
            return this.mt.RetauntSeconds > 0 && this.SinceTaunt(npc) >= this.mt.RetauntSeconds * this.world.TimerFrequency;
        }

        private bool Recently(NPC npc) => this.SinceTaunt(npc) < DoubleTauntGuardSeconds * this.world.TimerFrequency;

        private long SinceTaunt(NPC npc)
            => this.player.AutoHuntTaunted.TryGetValue(npc, out long at) ? this.world.TimeNow - at : long.MaxValue;

        private void Mark(NPC npc) => this.player.AutoHuntTaunted[npc] = this.world.TimeNow;

        private bool IsAlly(Player other)
            => this.player.Group is not null && this.player.Group.Players.Contains(other);

        private void Prune()
        {
            foreach (var npc in this.player.AutoHuntTaunted.Keys.ToList())
            {
                if (npc.State != NPC.States.Alive || npc.Map != this.player.Map)
                    this.player.AutoHuntTaunted.Remove(npc);
            }
        }
    }
}
