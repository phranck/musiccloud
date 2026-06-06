import { PlayerButton, PlayerProgress, PlayerRoot, PlayerTime } from "@/components/playback/PlayerParts";

export const Player = Object.assign(PlayerRoot, {
  Button: PlayerButton,
  Progress: PlayerProgress,
  Time: PlayerTime,
});
