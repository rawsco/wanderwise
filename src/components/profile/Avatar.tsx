interface AvatarProps {
  name: string;
  type: string;
  src?: string | null;
  size?: "sm" | "md" | "lg";
}

const typeEmoji: Record<string, string> = { adult: "👤", child: "🧒", dog: "🐶", cat: "🐱" };

const sizeMap = { sm: 48, md: 96, lg: 256 };

const bgColors = [
  "bg-emerald-100 text-emerald-700",
  "bg-blue-100 text-blue-700",
  "bg-purple-100 text-purple-700",
  "bg-amber-100 text-amber-700",
  "bg-pink-100 text-pink-700",
];

function colorForName(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return bgColors[Math.abs(hash) % bgColors.length];
}

function initials(name: string) {
  return name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
}

export function Avatar({ name, type, src, size = "md" }: AvatarProps) {
  const px = sizeMap[size];
  const textSize = size === "sm" ? "text-xs" : size === "md" ? "text-sm" : "text-2xl";
  const rounded = "rounded-full overflow-hidden";

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={name} width={px} height={px} className={`${rounded} object-cover flex-shrink-0`} style={{ width: px, height: px }} />
    );
  }

  const isPet = type === "dog" || type === "cat";

  if (isPet) {
    return (
      <div
        className={`${rounded} flex items-center justify-center bg-gray-100 flex-shrink-0`}
        style={{ width: px, height: px, fontSize: px * 0.5 }}
      >
        {typeEmoji[type]}
      </div>
    );
  }

  return (
    <div
      className={`${rounded} flex items-center justify-center flex-shrink-0 font-semibold ${colorForName(name)} ${textSize}`}
      style={{ width: px, height: px }}
    >
      {initials(name)}
    </div>
  );
}
