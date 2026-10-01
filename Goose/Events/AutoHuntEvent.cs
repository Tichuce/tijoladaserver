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

            if (!player.AutoHuntPaused && !IsHeld(player)) Act(player, world);

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
            if (player.MaxHP > 0 && player.CurrentHP * 100 < player.MaxHP * world.Settings.AutoHuntMinHPPercent)
                return "your HP is low.";
            if (player.Windows.Any(w => w.Type == Window.WindowTypes.Vendor))
                return "you are trading with a vendor.";
            if (player.IsMounted(world))
                return "you can't fight while mounted.";
            return null;
        }

        private static bool IsHeld(Player player)
        {
            return player.Buffs.Any(b =>
                b.SpellEffect.EffectType == SpellEffect.EffectTypes.Stun ||
                b.SpellEffect.EffectType == SpellEffect.EffectTypes.Root);
        }

        private static void Act(Player player, GameWorld world)
        {
            NPC? target = player.AutoHuntTarget;
            if (target is not null && !IsHuntable(player, target, world))
            {
                target = null;
            }

            if (target is null)
            {
                target = FindTarget(player, world);
                player.AutoHuntTarget = target;
                player.AutoHuntFailedSteps = 0;
                player.AutoHuntChaseSteps = 0;
            }

            if (target is null)
            {
                player.AutoHuntIgnored.Clear();
                if (player.MapX != player.AutoHuntOriginX || player.MapY != player.AutoHuntOriginY)
                    Step(player, player.AutoHuntOriginX, player.AutoHuntOriginY, world);
                return;
            }

            int distance = Math.Abs(target.MapX - player.MapX) + Math.Abs(target.MapY - player.MapY);
            if (distance == 1)
            {
                Face(player, DirectionTo(player, target), world);
                new PlayerAttackEvent { Player = player }.Ready(world);
                return;
            }

            player.AutoHuntChaseSteps++;
            bool moved = Step(player, target.MapX, target.MapY, world);
            player.AutoHuntFailedSteps = moved ? 0 : player.AutoHuntFailedSteps + 1;

            if (player.AutoHuntFailedSteps >= MaxFailedSteps ||
                player.AutoHuntChaseSteps > world.Settings.AutoHuntRadius * 4)
            {
                player.AutoHuntIgnored.Add(target);
                player.AutoHuntTarget = null;
            }
        }

        private static bool IsHuntable(Player player, NPC npc, GameWorld world)
        {
            return npc.State == NPC.States.Alive &&
                npc.Map == player.Map &&
                npc.NPCType == NPCTemplate.Types.Monster &&
                npc.CanBeKilled &&
                (!npc.IsInvisible || player.CanSeeInvisible) &&
                Math.Max(Math.Abs(npc.MapX - player.AutoHuntOriginX), Math.Abs(npc.MapY - player.AutoHuntOriginY))
                    <= world.Settings.AutoHuntRadius;
        }

        private static NPC? FindTarget(Player player, GameWorld world)
        {
            return player.Map.GetNPCsInRange(player)
                .Where(n => !player.AutoHuntIgnored.Contains(n) && IsHuntable(player, n, world))
                .OrderBy(n => Math.Abs(n.MapX - player.MapX) + Math.Abs(n.MapY - player.MapY))
                .FirstOrDefault();
        }

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

        private static Direction DirectionTo(Player player, ICharacter target)
        {
            if (target.MapY < player.MapY) return Direction.Up;
            if (target.MapY > player.MapY) return Direction.Down;
            if (target.MapX < player.MapX) return Direction.Left;
            return Direction.Right;
        }

        private static void Face(Player player, Direction direction, GameWorld world)
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
