// Keep stable IDs for saved matches; order controls the difficulty slider.
export const PONG_MODES = {
  easy: { label: 'Easy', speed: 240, maxSpeed: 360, acceleration: 1.025, paddle: 140, reaction: .34, lookAhead: .2, error: 58 },
  casual: { label: 'Casual', speed: 270, maxSpeed: 410, acceleration: 1.03, paddle: 175, reaction: .285, lookAhead: .35, error: 58 },
  medium: { label: 'Medium', speed: 300, maxSpeed: 460, acceleration: 1.035, paddle: 210, reaction: .23, lookAhead: .5, error: 58 },
  advanced: { label: 'Advanced', speed: 330, maxSpeed: 510, acceleration: 1.04, paddle: 247, reaction: .195, lookAhead: .675, error: 53 },
  hard: { label: 'Truly difficult', speed: 360, maxSpeed: 560, acceleration: 1.045, paddle: 285, reaction: .16, lookAhead: .85, error: 48 },
  ultra: { label: 'Ultra difficult', speed: 440, maxSpeed: 700, acceleration: 1.06, paddle: 380, reaction: .09, lookAhead: 1.4, error: 25 },
};
