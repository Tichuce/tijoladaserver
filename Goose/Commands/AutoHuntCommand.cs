namespace Goose.Commands
{
    [Command("/autohunt", Section = "General", Help = "Fight nearby monsters automatically. /autohunt pause holds it, /autohunt off or moving stops it.")]
    public sealed class AutoHuntCommand : BaseCommand
    {
        public void Execute(CommandContext ctx, string[] mode)
        {
            var world = ctx.World;
            var player = ctx.Player;
            string arg = mode.Length > 0 ? mode[0].ToLowerInvariant() : "";

            if (arg == "sync")
            {
                player.AutoHuntSynced = true;
                SendConfig(player, world);
                world.Send(player, P.AutoHuntStatus(player.AutoHuntState, player.AutoHuntDetail));
                return;
            }

            if (arg == "config")
            {
                SaveConfig(ctx, mode.Length > 1 ? mode[1] : "");
                return;
            }

            if (arg == "reset")
            {
                AutoHuntSettings.Reset(player);
                SendConfig(player, world);
                ctx.Send("Auto-hunt settings reset.");
                return;
            }

            if (arg == "pause")
            {
                if (!player.IsAutoHunting)
                    ctx.Send("Auto-hunt is not running.");
                else if (player.AutoHuntPaused)
                    ctx.Send("Auto-hunt is already paused.");
                else
                    player.PauseAutoHunt(world);
                return;
            }

            if (arg == "off" || (arg == "" && player.IsAutoHunting))
            {
                if (player.IsAutoHunting)
                    player.StopAutoHunt(world, "turned off.");
                else
                    ctx.Send("Auto-hunt is not running.");
                return;
            }

            if (arg != "" && arg != "on" && arg != "resume")
            {
                ctx.Send("Usage: /autohunt [on|pause|off]");
                return;
            }

            if (!world.Settings.AutoHuntEnabled)
            {
                ctx.Send("Auto-hunt is disabled on this server.");
                return;
            }

            if (player.IsAutoHunting && !player.AutoHuntPaused)
            {
                ctx.Send("Auto-hunt is already running.");
                return;
            }

            if (player.IsMounted(world))
            {
                ctx.Send(player.IsAutoHunting ? "Dismount before resuming auto-hunt." : "Dismount before starting auto-hunt.");
                return;
            }

            if (player.IsAutoHunting)
                player.ResumeAutoHunt(world);
            else
                player.StartAutoHunt(world);
        }

        private static void SaveConfig(CommandContext ctx, string encoded)
        {
            if (!AutoHuntSettings.TryApply(ctx.Player, ctx.World, encoded))
            {
                ctx.Send("Auto-hunt settings were not saved: invalid data.");
                return;
            }

            SendConfig(ctx.Player, ctx.World);
        }

        private static void SendConfig(Player player, GameWorld world)
            => world.Send(player, P.AutoHuntConfig(AutoHuntSettings.ConfigJson(player, world)));
    }
}
