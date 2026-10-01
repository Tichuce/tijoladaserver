using System;

namespace AsperetaClient
{
    public class Animation
    {
        public bool Animating { get; set; }

        public bool Loop { get; set; }

        public bool Finished { get; set; }

        public Texture[] Frames { get; set; }

        public double Interval { get; set; }

        public int CurrentFrame { get; set; }

        public double CurrentTime { get; set; }

        public Colour Colour { get; set; }

        public event Action<Animation> AnimationFinished;

        public Animation()
        {
            this.Animating = true;
            this.Loop = false;
            this.Finished = false;
            this.Interval = 10;
            this.CurrentFrame = 0;
            this.CurrentTime = 0;
        }

        public void Update(double dt)
        {
            if (!this.Animating) return;

            this.CurrentTime += dt;

            if (this.CurrentTime > Interval)
            {
                this.CurrentTime -= Interval;
                this.CurrentFrame++;
            }

            if (this.CurrentFrame >= Frames.Length)
            {
                this.CurrentFrame = 0;
                this.Finished = !this.Loop;

                if (Finished)
                    this.AnimationFinished?.Invoke(this);
            }
        }

        public void Render(int x, int y)
        {
            this.Frames[this.CurrentFrame].Render(x, y, Colour);
        }

        public void SetAnimating(bool animating)
        {
            this.Animating = animating;
            this.CurrentFrame = 0;
            this.CurrentTime = 0;
            this.Finished = false;
        }

        public int GetWidth()
        {
            return this.Frames[this.CurrentFrame].W;
        }

        public int GetHeight()
        {
            return this.Frames[this.CurrentFrame].H;
        }

        public int GetXOffset()
        {
            return this.Frames[this.CurrentFrame].XOffset;
        }

        public int GetYOffset()
        {
            return this.Frames[this.CurrentFrame].YOffset;
        }
    }
}
