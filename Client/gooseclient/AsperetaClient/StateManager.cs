using System;
using System.Collections.Generic;
using SDL2;

namespace AsperetaClient
{
    public class State
    {
        public virtual void Update(double dt)
        {

        }

        public virtual void Render(double dt)
        {

        }

        public virtual void HandleEvent(SDL.SDL_Event ev)
        {

        }

        public virtual void Starting()
        {

        }

        public virtual void Ending()
        {

        }

        public virtual void Suspending()
        {

        }

        public virtual void Resuming()
        {

        }
    }

    public class StateManager
    {
        private Stack<State> states = new Stack<State>();

        public void AppendState(State newState)
        {
            if (states.TryPeek(out State lastState))
            {
                lastState.Suspending();
            }

            states.Push(newState);

            newState.Starting();
        }

        public void ReplaceState(State newState)
        {
            if (states.TryPop(out State lastState))
            {
                lastState.Ending();
            }

            states.Push(newState);

            newState.Starting();
        }

        public void RemoveState()
        {
            if (states.TryPop(out State lastState))
            {
                lastState.Ending();
            }

            if (states.TryPeek(out State nextState))
            {
                nextState.Resuming();
            }
        }

        public void Update(double dt)
        {
            if (states.TryPeek(out State state))
            {
                state.Update(dt);
            }
        }

        public void Render(double dt)
        {
            if (states.TryPeek(out State state))
            {
                state.Render(dt);
            }
        }

        public void HandleEvent(SDL.SDL_Event ev)
        {
            if (states.TryPeek(out State state))
            {
                state.HandleEvent(ev);
            }
        }
    }
}
