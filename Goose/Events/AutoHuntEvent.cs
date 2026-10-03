namespace Goose.Events
{
    public class AutoHuntEvent : Event
    {
        private const int MaxFailedSteps = 6;

        public override void Ready(GameWorld world)
        {
            Player player = this.Player;
            if (player.AutoHuntEvent != this) return;

            string? stopReason = StopReason(player, world);
            // While paused only the silent reasons (logout, map change) end the session.
            if (stopReason is not null && (!player.AutoHuntPaused || stopReason.Length == 0))
            {
                player.StopAutoHunt(world, stopReason.Length == 0 ? null : stopReason);
                return;
            }

            if (!player.AutoHuntPaused && !IsStunned(player)) Act(player, world, IsRooted(player));

            this.Ticks = world.TimeNow + Math.Max(1, world.Settings.AutoHuntStepMilliseconds) * world.TimerFrequency / 1000;
            world.EventHandler.AddEvent(this);
        }

        // "" stops silently: the player is gone or mid-transition and can't be messaged usefully.
        private static string? StopReason(Player player, GameWorld world)
        {
            if (player.State != Player.States.Ready || player.Map is null || player.MapID != player.AutoHuntMapID)
                return "";
            if (!world.Settings.AutoHuntEnabled)
                return "auto-hunt is disabled on this server.";
            // Stops at or below AutoHuntMinHPPercent (5% by default). Only the player's HP is
            // checked; nearby NPCs (aggressive or not) play no part in this decision.
            if (player.MaxHP > 0 && player.CurrentHP * 100 <= player.MaxHP * world.Settings.AutoHuntMinHPPercent)
                return "your HP is low.";
            if (player.Windows.Any(w => w.Type == Window.WindowTypes.Vendor))
                return "you are trading with a vendor.";
            if (player.IsMounted(world))
                return "you can't fight while mounted.";
            return null;
        }

        private static bool IsStunned(Player player)
            => player.Buffs.Any(b => b.SpellEffect.EffectType == SpellEffect.EffectTypes.Stun);

        private static bool IsRooted(Player player)
            => player.Buffs.Any(b => b.SpellEffect.EffectType == SpellEffect.EffectTypes.Root);

        private static void Act(Player player, GameWorld world, bool rooted)
        {
            var settings = AutoHuntSettings.For(player);
            var caster = new AutoHuntCaster(player, world);

            if (caster.TryHeal(settings) || caster.TryBuff(settings)) return;
            if (new AutoHuntPuller(player, world, caster, settings).TryTaunt(rooted)) return;

            NPC? target = player.AutoHuntTarget;
            if (target is not null && !IsHuntable(player, target, world))
            {
                target = null;
            }

            if (target is null)
            {
                target = FindTarget(player, world, settings);
                player.AutoHuntTarget = target;
                player.AutoHuntFailedSteps = 0;
                player.AutoHuntChaseSteps = 0;
                player.AutoHuntWaitTicks = 0;
            }

            if (target is not null && settings.Taunt.Enabled && !Touching(player, target) &&
                player.Map.GetNPCsInRange(player).FirstOrDefault(n => n.AggroTarget == player && Touching(player, n) &&
                    IsHuntable(player, n, world)) is { } attacker)
            {
                target = attacker;
                player.AutoHuntTarget = attacker;
                player.AutoHuntFailedSteps = 0;
                player.AutoHuntChaseSteps = 0;
            }

            if (target is null)
            {
                player.AutoHuntIgnored.Clear();
                if (!rooted && (player.MapX != player.AutoHuntOriginX || player.MapY != player.AutoHuntOriginY))
                {
                    Step(player, player.AutoHuntOriginX, player.AutoHuntOriginY, world);
                    player.SetAutoHuntStatus(world, "moving", "Returning");
                }
                else
                {
                    player.SetAutoHuntStatus(world, "waiting", "No monsters");
                }
                return;
            }

            if (caster.TryAttack(settings, target)) return;
            if (rooted)
            {
                player.SetAutoHuntStatus(world, "waiting", "Rooted");
                return;
            }

            if (!settings.Melee)
            {
                KeepDistance(player, target, settings, world);
                return;
            }

            int distance = Math.Abs(target.MapX - player.MapX) + Math.Abs(target.MapY - player.MapY);
            if (distance != 1 && AutoHuntPuller.ShouldWaitForPull(player, target, settings))
            {
                player.SetAutoHuntStatus(world, "pulling", "Gathering " + target.Name);
                return;
            }

            if (distance == 1)
            {
                player.AutoHuntWaitTicks = 0;
                Face(player, DirectionTo(player, target), world);

                long lastAttack = player.LastAttack;
                new PlayerAttackEvent { Player = player }.Ready(world);

                // PlayerAttackEvent only shows the swing to other players, because a manual
                // attack is animated by the attacker's own client when the key is pressed.
                // Auto-hunt swings start on the server, so the hunter's client also needs
                // the same ATT packet or the character never plays its attack animation.
                if (player.LastAttack != lastAttack)
                    world.Send(player, P.Attack(player));
                player.SetAutoHuntStatus(world, "active", target.Name);
                return;
            }

            Chase(player, target, world);
        }

        private static void Chase(Player player, NPC target, GameWorld world)
        {
            player.AutoHuntChaseSteps++;
            bool moved = Step(player, target.MapX, target.MapY, world);
            player.AutoHuntFailedSteps = moved ? 0 : player.AutoHuntFailedSteps + 1;
            player.SetAutoHuntStatus(world, "moving", target.Name);

            if (player.AutoHuntFailedSteps >= MaxFailedSteps ||
                player.AutoHuntChaseSteps > world.Settings.AutoHuntRadius * 4)
            {
                player.AutoHuntIgnored.Add(target);
                player.AutoHuntTarget = null;
            }
        }

        private static void KeepDistance(Player player, NPC target, AutoHuntSettings settings, GameWorld world)
        {
            var threats = Threats(player).ToList();
            int nearest = threats.Count == 0 ? int.MaxValue : threats.Min(n => AutoHuntSpells.Distance(player, n));

            if (settings.MinDistance > 0 && nearest < settings.MinDistance)
            {
                if (StepAway(player, threats, nearest, world))
                {
                    player.SetAutoHuntStatus(world, "repositioning", target.Name);
                    return;
                }
            }
            else if (AutoHuntSpells.Distance(player, target) > settings.KeepDistance)
            {
                Chase(player, target, world);
                return;
            }

            player.AutoHuntChaseSteps = 0;
            player.SetAutoHuntStatus(world, "waiting", target.Name);
        }

        private static IEnumerable<NPC> Threats(Player player)
        {
            return player.Map.GetNPCsInRange(player).Where(n =>
                n.State == NPC.States.Alive &&
                n.NPCType == NPCTemplate.Types.Monster &&
                n.CanBeKilled);
        }

        private static bool StepAway(Player player, List<NPC> threats, int nearest, GameWorld world)
        {
            int radius = world.Settings.AutoHuntRadius;
            int bestNearest = nearest;
            int bestTotal = threats.Sum(n => AutoHuntSpells.Distance(player, n));
            Direction? best = null;

            foreach (Direction direction in new[] { Direction.Up, Direction.Right, Direction.Down, Direction.Left })
            {
                (int dx, int dy) = AutoHuntSpells.Step(direction);
                int x = player.MapX + dx;
                int y = player.MapY + dy;
                if (Math.Max(Math.Abs(x - player.AutoHuntOriginX), Math.Abs(y - player.AutoHuntOriginY)) > radius) continue;
                if (player.Map.GetTile(x, y) is WarpTile || !player.CanMoveTo(x, y)) continue;

                int near = threats.Min(n => Math.Max(Math.Abs(n.MapX - x), Math.Abs(n.MapY - y)));
                int total = threats.Sum(n => Math.Max(Math.Abs(n.MapX - x), Math.Abs(n.MapY - y)));
                if (near > bestNearest || (near == bestNearest && total > bestTotal))
                {
                    bestNearest = near;
                    bestTotal = total;
                    best = direction;
                }
            }

            if (best is not Direction chosen) return false;

            (int sx, int sy) = AutoHuntSpells.Step(chosen);
            player.MoveTo(world, player.MapX + sx, player.MapY + sy);
            player.Facing = chosen;
            world.Send(player, P.SetYourPosition(player));
            return true;
        }

        public static bool IsHuntable(Player player, NPC npc, GameWorld world)
        {
            return npc.State == NPC.States.Alive &&
                npc.Map == player.Map &&
                npc.NPCType == NPCTemplate.Types.Monster &&
                npc.CanBeKilled &&
                (!npc.IsInvisible || player.CanSeeInvisible) &&
                Math.Max(Math.Abs(npc.MapX - player.AutoHuntOriginX), Math.Abs(npc.MapY - player.AutoHuntOriginY))
                    <= world.Settings.AutoHuntRadius;
        }

        // An ignored monster is still fought back while it is attacking the hunter.
        private static NPC? FindTarget(Player player, GameWorld world, AutoHuntSettings settings)
        {
            return player.Map.GetNPCsInRange(player)
                .Where(n => !player.AutoHuntIgnored.Contains(n) && IsHuntable(player, n, world) &&
                    (!settings.IsIgnored(n) || n.AggroTarget == player))
                .OrderBy(n => settings.PriorityOf(n))
                .ThenBy(n => Math.Abs(n.MapX - player.MapX) + Math.Abs(n.MapY - player.MapY))
                .FirstOrDefault();
        }

        private static bool Touching(Player player, ICharacter other)
            => Math.Abs(other.MapX - player.MapX) + Math.Abs(other.MapY - player.MapY) == 1;

        public static bool StepToward(Player player, int targetX, int targetY, GameWorld world)
            => Step(player, targetX, targetY, world);

        private static bool Step(Player player, int targetX, int targetY, GameWorld world)
        {
            Direction direction = player.NextStepTo(targetX, targetY, world);

            (int x, int y) = direction switch
            {
                Direction.Up => (player.MapX, player.MapY - 1),
                Direction.Right => (player.MapX + 1, player.MapY),
                Direction.Down => (player.MapX, player.MapY + 1),
                Direction.Left => (player.MapX - 1, player.MapY),
                _ => (player.MapX, player.MapY),
            };

            // Map.CanMoveTo lets players onto warp tiles, but only MoveEvent performs the warp.
            if (player.Map.GetTile(x, y) is WarpTile || !player.CanMoveTo(x, y))
                return false;

            player.MoveTo(world, x, y);
            player.Facing = direction;
            world.Send(player, P.SetYourPosition(player));
            return true;
        }

        public static Direction DirectionTo(Player player, ICharacter target)
        {
            if (target.MapY < player.MapY) return Direction.Up;
            if (target.MapY > player.MapY) return Direction.Down;
            if (target.MapX < player.MapX) return Direction.Left;
            return Direction.Right;
        }

        public static void Face(Player player, Direction direction, GameWorld world)
        {
            if (player.Facing == direction) return;

            player.Facing = direction;
            string packet = P.ChangeHeading(player);
            world.Send(player, packet);
            foreach (var other in player.Map.GetPlayersInRange(player))
            {
                world.Send(other, packet);
            }
        }
    }
}
