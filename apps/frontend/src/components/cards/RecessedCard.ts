import { type AddOn, Body, Header, RecessedCardRoot, type Title } from "@/components/cards/RecessedCardParts";

export const RecessedCard = Object.assign(RecessedCardRoot, {
  Header: Header as typeof Header & { Title: typeof Title; AddOn: typeof AddOn },
  Body,
});
