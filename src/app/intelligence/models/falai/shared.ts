export function mapToValidAspectRatio(ratio: string): string {
  const valid = ['auto', '21:9', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16'];
  if (valid.includes(ratio)) return ratio;
  return 'auto';
}
