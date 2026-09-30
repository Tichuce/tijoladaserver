using System.Text.Json;
using Goose.Testing;

namespace Goose.Tests;

public class NPCLoginIdSpaceTests : IDisposable
{
    private readonly string root = Path.Combine(Path.GetTempPath(), "login-id-space-" + Guid.NewGuid().ToString("N"));

    public void Dispose()
    {
        if (Directory.Exists(root)) Directory.Delete(root, recursive: true);
    }

    [Theory]
    [InlineData(200, 30000)]
    [InlineData(200, 250000)]
    [InlineData(200, 9800)]
    public void Aspereta_IdSpaceBeyondClientArray_IsFatal(int maxPlayers, int maxNpcs)
    {
        var settings = new GooseSettings { ServerType = "Aspereta", MaxPlayers = maxPlayers, MaxNPCs = maxNpcs };

        Assert.Throws<FatalStartupException>(() => settings.ValidateLoginIdSpace());
    }

    [Fact]
    public void Aspereta_IdSpaceWithinClientArray_Passes()
    {
        var settings = new GooseSettings { ServerType = "Aspereta", MaxPlayers = 200, MaxNPCs = 9500 };

        settings.ValidateLoginIdSpace();
    }

    [Fact]
    public void Illutia_LargeIdSpace_Passes()
    {
        var settings = new GooseSettings { ServerType = "Illutia", MaxPlayers = 200, MaxNPCs = 250000 };

        settings.ValidateLoginIdSpace();
    }

    [Fact]
    public void Loader_AsperetaWithOversizedMaxNpcs_Throws()
    {
        Directory.CreateDirectory(root);
        File.WriteAllText(Path.Combine(root, "GooseSettings.json"), JsonSerializer.Serialize(
            new GooseSettings { ServerType = "Aspereta", MaxPlayers = 200, MaxNPCs = 30000 },
            JsonHelper.SettingsOptions));

        Assert.Throws<FatalStartupException>(() => GooseSettingsLoader.Load(root, root));
    }

    [Fact]
    public void GetNewID_RangeExhausted_ThrowsInsteadOfSpinning()
    {
        using var fixture = new TestWorldFixture(s => { s.MaxPlayers = 200; s.MaxNPCs = 203; });
        var world = fixture.World;

        var first = new NPC();
        var second = new NPC();
        world.NPCHandler.AssignNewId(world, first);
        world.NPCHandler.AssignNewId(world, second);

        Assert.Equal(new[] { 201, 202 }, new[] { first.LoginID, second.LoginID }.Order());
        Assert.Throws<InvalidOperationException>(() => world.NPCHandler.GetNewID(world));
    }

    [Fact]
    public void AssignNewId_RespawnInFullRange_ReusesFreedId()
    {
        using var fixture = new TestWorldFixture(s => { s.MaxPlayers = 200; s.MaxNPCs = 203; });
        var world = fixture.World;

        var first = new NPC();
        var second = new NPC();
        world.NPCHandler.AssignNewId(world, first);
        world.NPCHandler.AssignNewId(world, second);
        int before = first.LoginID;

        world.NPCHandler.AssignNewId(world, first);

        Assert.Equal(before, first.LoginID);
    }
}
