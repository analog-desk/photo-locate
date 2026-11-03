import type { Category } from './types';
/** Generic, subject-based composition guidance (clearly labelled as not location-specific). */
const TIPS: Partial<Record<Category, string[]>> = {
  mountains: ['Use a telephoto to compress layered ridges in haze', 'Look for alpenglow on peaks facing the sun just after sunset'],
  waterfalls: ['A 0.5–2 s exposure with an ND filter smooths water', 'Use wet rocks or ferns as foreground leading into the falls'],
  lakes: ['Shoot calm mornings for mirror reflections; a polariser controls glare', 'Place the horizon low to give the reflection room'],
  beaches: ['Time receding waves for leading lines on wet sand', 'Long exposures at blue hour turn surf into mist'],
  coastlines: ['Check tide tables — low tide reveals rock foregrounds', 'Sea stacks and arches frame the setting sun well'],
  forests: ['Overcast or foggy days give even light and depth', 'Look for sunbeams through mist shortly after sunrise'],
  architecture: ['Shoot façades front-lit by golden hour; interiors at blue hour when lights balance the sky', 'Keep verticals straight with a tilt-shift or in post'],
  cityscapes: ['Blue hour balances city lights with the sky', 'Elevated viewpoints and long exposures create light trails'],
  street: ['Low sun creates long shadows and rim-lit silhouettes', 'Respect people’s privacy and local laws on photographing individuals'],
  abandoned: ['Only shoot from public land unless you have permission', 'Soft overcast light suits textures and decay'],
  astro: ['Use the 500/NPF rule for sharp stars; focus manually on a bright star', 'Plan around the moon-free darkness window shown above'],
  night: ['Bracket exposures for bright light sources', 'A sturdy tripod and remote release are essential'],
  wildlife: ['Keep your distance — use a long lens and never disturb animals', 'Early morning and late evening are typically the most active times'],
  drone: ['Check local airspace rules and protected-area bans before flying', 'Top-down views reveal patterns invisible from the ground'],
  landscape: ['Find a strong foreground element to anchor the frame', 'Side light at golden hour reveals texture and depth'],
};
export function compositionTips(cats: Category[]): string[] {
  const out: string[] = [];
  for (const c of cats) for (const t of TIPS[c] ?? []) if (!out.includes(t)) out.push(t);
  return (out.length ? out : TIPS.landscape!).slice(0, 5);
}
