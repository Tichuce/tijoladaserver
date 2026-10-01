using System;
using AsperetaClient.Scripting.GameState;

namespace AsperetaClient;


public interface IClientScript
{
    GameState GameState { get; set; }

    void OnLoaded() { }

    void OnGameScreenCreated(GameScreen screen) { }

    void OnMapLoaded(Map map) { }

    void Stop();

    void OnReloaded() {}
}
