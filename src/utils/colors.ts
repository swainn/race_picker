export const PLAYER_COLORS = [
  '#FF6B6B', '#4ECDC4', '#FFE66D', '#95E1D3',
  '#F38181', '#AA96DA', '#FCBAD3', '#A8D8EA',
  '#FF8B94', '#D4A5A5', '#9BC995', '#C7CEEA',
  '#FFB4A2', '#E5989B', '#B5838D', '#6D6875',
  '#FF1744', '#00B0FF', '#76FF03', '#FFD600',
  '#F50057', '#651FFF',
];

export function generateColor(index: number): string {
  return PLAYER_COLORS[index % PLAYER_COLORS.length];
}
