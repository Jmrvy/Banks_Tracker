import {
  Apple,
  Baby,
  Banknote,
  Beer,
  Bike,
  BookOpen,
  Briefcase,
  Building2,
  Bus,
  Cake,
  Car,
  Cat,
  Coffee,
  CreditCard,
  Dog,
  Drama,
  Dumbbell,
  Film,
  Flower2,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  HandCoins,
  Hammer,
  HeartPulse,
  Home,
  IceCream,
  Laptop,
  Leaf,
  Lightbulb,
  Music,
  Newspaper,
  Package,
  PartyPopper,
  Phone,
  Pill,
  PiggyBank,
  Pizza,
  Plane,
  Plug,
  Receipt,
  Scissors,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Stethoscope,
  Tag,
  Ticket,
  TrainFront,
  TrendingUp,
  Trophy,
  Tv,
  Umbrella,
  UtensilsCrossed,
  Wallet,
  Wifi,
  Wine,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export interface IconEntry {
  name: string;
  icon: LucideIcon;
  /** Used to filter icons in the picker. Lower-case keywords. */
  keywords: string;
}

export interface IconGroup {
  groupKey: string;
  groupDefault: string;
  icons: IconEntry[];
}

export const CATEGORY_ICON_GROUPS: IconGroup[] = [
  {
    groupKey: "categoryIcons.groups.food",
    groupDefault: "Food & drink",
    icons: [
      { name: "UtensilsCrossed", icon: UtensilsCrossed, keywords: "restaurant dining meal" },
      { name: "Coffee", icon: Coffee, keywords: "coffee cafe drink" },
      { name: "Pizza", icon: Pizza, keywords: "pizza fast food" },
      { name: "Apple", icon: Apple, keywords: "fruit groceries food" },
      { name: "Wine", icon: Wine, keywords: "wine alcohol drink" },
      { name: "Beer", icon: Beer, keywords: "beer pub bar" },
      { name: "IceCream", icon: IceCream, keywords: "icecream dessert" },
      { name: "Cake", icon: Cake, keywords: "cake bakery dessert" },
    ],
  },
  {
    groupKey: "categoryIcons.groups.transport",
    groupDefault: "Transport",
    icons: [
      { name: "Car", icon: Car, keywords: "car auto vehicle" },
      { name: "Bus", icon: Bus, keywords: "bus public transport" },
      { name: "TrainFront", icon: TrainFront, keywords: "train rail metro" },
      { name: "Plane", icon: Plane, keywords: "plane flight travel" },
      { name: "Bike", icon: Bike, keywords: "bike bicycle cycling" },
      { name: "Fuel", icon: Fuel, keywords: "gas fuel petrol" },
    ],
  },
  {
    groupKey: "categoryIcons.groups.home",
    groupDefault: "Home & utilities",
    icons: [
      { name: "Home", icon: Home, keywords: "home rent house" },
      { name: "Lightbulb", icon: Lightbulb, keywords: "electricity light power" },
      { name: "Plug", icon: Plug, keywords: "electricity power utilities" },
      { name: "Wifi", icon: Wifi, keywords: "internet wifi" },
      { name: "Wrench", icon: Wrench, keywords: "repair maintenance" },
      { name: "Hammer", icon: Hammer, keywords: "diy tools repair" },
      { name: "Building2", icon: Building2, keywords: "apartment building rent" },
      { name: "Umbrella", icon: Umbrella, keywords: "insurance protection" },
    ],
  },
  {
    groupKey: "categoryIcons.groups.shopping",
    groupDefault: "Shopping",
    icons: [
      { name: "ShoppingBag", icon: ShoppingBag, keywords: "shopping bag retail" },
      { name: "ShoppingCart", icon: ShoppingCart, keywords: "groceries cart" },
      { name: "Shirt", icon: Shirt, keywords: "clothing apparel" },
      { name: "Gift", icon: Gift, keywords: "gift present" },
      { name: "Package", icon: Package, keywords: "package delivery online" },
      { name: "Tag", icon: Tag, keywords: "sale tag price" },
    ],
  },
  {
    groupKey: "categoryIcons.groups.health",
    groupDefault: "Health & wellness",
    icons: [
      { name: "HeartPulse", icon: HeartPulse, keywords: "health heart medical" },
      { name: "Pill", icon: Pill, keywords: "pharmacy medicine pill" },
      { name: "Stethoscope", icon: Stethoscope, keywords: "doctor medical clinic" },
      { name: "Dumbbell", icon: Dumbbell, keywords: "gym fitness sport workout" },
      { name: "Scissors", icon: Scissors, keywords: "haircut beauty salon" },
      { name: "Sparkles", icon: Sparkles, keywords: "beauty cosmetics" },
    ],
  },
  {
    groupKey: "categoryIcons.groups.entertainment",
    groupDefault: "Entertainment",
    icons: [
      { name: "Film", icon: Film, keywords: "movies cinema film" },
      { name: "Music", icon: Music, keywords: "music streaming spotify" },
      { name: "Tv", icon: Tv, keywords: "tv television streaming" },
      { name: "Gamepad2", icon: Gamepad2, keywords: "games gaming" },
      { name: "Ticket", icon: Ticket, keywords: "ticket event concert" },
      { name: "Drama", icon: Drama, keywords: "theater show performance" },
      { name: "PartyPopper", icon: PartyPopper, keywords: "party celebration event" },
      { name: "Trophy", icon: Trophy, keywords: "sports trophy competition" },
    ],
  },
  {
    groupKey: "categoryIcons.groups.subscriptions",
    groupDefault: "Subscriptions & tech",
    icons: [
      { name: "Smartphone", icon: Smartphone, keywords: "phone mobile bill" },
      { name: "Phone", icon: Phone, keywords: "phone telephone landline" },
      { name: "Laptop", icon: Laptop, keywords: "computer laptop tech" },
      { name: "Newspaper", icon: Newspaper, keywords: "subscription news media" },
      { name: "BookOpen", icon: BookOpen, keywords: "book reading subscription" },
    ],
  },
  {
    groupKey: "categoryIcons.groups.money",
    groupDefault: "Money & income",
    icons: [
      { name: "Wallet", icon: Wallet, keywords: "wallet cash" },
      { name: "Banknote", icon: Banknote, keywords: "income salary cash" },
      { name: "PiggyBank", icon: PiggyBank, keywords: "savings piggybank" },
      { name: "TrendingUp", icon: TrendingUp, keywords: "investment growth markets" },
      { name: "CreditCard", icon: CreditCard, keywords: "credit card payment" },
      { name: "Receipt", icon: Receipt, keywords: "receipt invoice tax" },
      { name: "HandCoins", icon: HandCoins, keywords: "salary payment pay" },
      { name: "Briefcase", icon: Briefcase, keywords: "work salary business" },
    ],
  },
  {
    groupKey: "categoryIcons.groups.life",
    groupDefault: "Life & misc",
    icons: [
      { name: "GraduationCap", icon: GraduationCap, keywords: "education school tuition" },
      { name: "Baby", icon: Baby, keywords: "baby kids childcare" },
      { name: "Dog", icon: Dog, keywords: "pet dog animal" },
      { name: "Cat", icon: Cat, keywords: "pet cat animal" },
      { name: "Flower2", icon: Flower2, keywords: "flowers gift home" },
      { name: "Leaf", icon: Leaf, keywords: "nature eco green" },
    ],
  },
];

const ICON_LOOKUP: Record<string, LucideIcon> = (() => {
  const m: Record<string, LucideIcon> = {};
  for (const g of CATEGORY_ICON_GROUPS) {
    for (const e of g.icons) m[e.name] = e.icon;
  }
  return m;
})();

export function getCategoryIcon(name: string | null | undefined): LucideIcon | null {
  if (!name) return null;
  return ICON_LOOKUP[name] ?? null;
}
