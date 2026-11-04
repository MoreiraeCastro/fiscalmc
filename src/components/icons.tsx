import type { ReactNode, SVGProps } from "react";

/*
 * Ícones do emissor (os mesmos do portal-hub), desenhados à mão: grade de 24, traço 1,6, pontas retas e cantos vivos — o mesmo
 * desenho técnico em tudo, no lugar do traço arredondado de biblioteca. Os nomes seguem os do lucide para a
 * troca ser só o caminho do import.
 */
export type IconProps = Omit<SVGProps<SVGSVGElement>, "ref"> & { size?: number | string; strokeWidth?: number };
export type Icon = (props: IconProps) => ReactNode;

function icon(name: string, paths: ReactNode): Icon {
  const Component = ({ size = 24, strokeWidth = 1.6, ...rest }: IconProps) => <svg
    xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="square" strokeLinejoin="miter" {...rest}
  >{paths}</svg>;
  Component.displayName = name;
  return Component;
}

const sheet = <path d="M6 3h8l4 4v14H6zM14 3v4h4" />;

// ---------------------------------------------------------------- documentos
export const File = icon("File", sheet);
export const FileText = icon("FileText", <>{sheet}<path d="M9 11h6M9 14h6M9 17h4" /></>);
export const FileSearch = icon("FileSearch", <>{sheet}<circle cx="11" cy="13.5" r="2.5" /><path d="M13 15.5l2 2" /></>);
export const FileSpreadsheet = icon("FileSpreadsheet", <>{sheet}<path d="M8.5 11h7v7h-7zM8.5 14.5h7M12 11v7" /></>);
export const FileImage = icon("FileImage", <>{sheet}<path d="M8.5 18l2.5-3 2 2 1.5-1.5 1.5 1.5M9.5 10.5h1v1h-1z" /></>);
export const FileSignature = icon("FileSignature", <>{sheet}<path d="M9 10.5h6M8.5 17.5c1-1.6 2-1.6 2.6 0 .6 1.4 1.6 1.2 2.9-.8" /></>);
export const FileCode = icon("FileCode", <>{sheet}<path d="M10.5 12l-2 2.25 2 2.25M13.5 12l2 2.25-2 2.25" /></>);
export const Receipt = icon("Receipt", <path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21zM9 8h6M9 11h6M9 14h3.5" />);
export const Archive = icon("Archive", <path d="M3.5 4.5h17v4h-17zM5 8.5v11h14v-11M10 12h4" />);
export const Folder = icon("Folder", <path d="M3.5 5.5h6l2 2h9v12h-17z" />);
export const FolderOpen = icon("FolderOpen", <path d="M3.5 19.5v-14h6l2 2h7v3M3.5 19.5l3-9h15l-3 9z" />);
export const FolderKanban = Folder;

// ---------------------------------------------------------------- lugares e pessoas
export const Home = icon("Home", <path d="M4 10.5L12 4l8 6.5V20H4zM10 20v-5h4v5" />);
export const Building2 = icon("Building2", <path d="M5 21V4h9v17M14 9h5v12M3 21h18M8 8h3M8 11.5h3M8 15h3M16.5 12.5h1M16.5 16h1" />);
export const LayoutGrid = icon("LayoutGrid", <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />);
export const Users = icon("Users", <>
  <circle cx="9" cy="8" r="3.2" />
  <path d="M3.5 20v-1.5c0-2.5 2.5-4.5 5.5-4.5s5.5 2 5.5 4.5V20M15.5 4.8a3.1 3.1 0 010 6.3M17.5 14.3c1.9.6 3 2.2 3 4.2V20" />
</>);
export const UserPlus = icon("UserPlus", <>
  <circle cx="10" cy="8" r="3.2" />
  <path d="M4 20v-1.5C4 16 6.5 14 10 14s6 2 6 4.5V20M19 8v6M16 11h6" />
</>);
export const User = icon("User", <><circle cx="12" cy="8" r="3.5" /><path d="M5 20v-1.5C5 15.5 8 13.5 12 13.5s7 2 7 5V20" /></>);
export const Banknote = icon("Banknote", <><path d="M2.5 6.5h19v11h-19zM5.5 9.5h.5M18 14.5h.5" /><circle cx="12" cy="12" r="2.5" /></>);
export const Copy = icon("Copy", <path d="M9 9h11v11H9zM15 9V4H4v11h5" />);
export const Ellipsis = icon("Ellipsis", <path d="M5.5 12h1M11.5 12h1M17.5 12h1" strokeWidth={2.4} />);
export const ExternalLink = icon("ExternalLink", <path d="M13 4h7v7M20 4l-9 9M17 14v6H4V7h6" />);
export const Mail = icon("Mail", <path d="M3.5 6h17v12h-17zM3.5 6.5l8.5 6.5 8.5-6.5" />);
export const Inbox = icon("Inbox", <path d="M3.5 13l2.5-8h12l2.5 8v6h-17zM3.5 13h5l1.5 2.5h4l1.5-2.5h5" />);
export const ShieldCheck = icon("ShieldCheck", <path d="M12 3l7.5 3v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6zM8.8 12l2.2 2.2 4.2-4.4" />);
/** Selo com fitas: certificados e alvarás. */
export const Seal = icon("Seal", <><circle cx="12" cy="9.5" r="6" /><path d="M8.3 14.2L7 21.5l5-2.5 5 2.5-1.3-7.3M9.4 9.6l1.8 1.8 3.4-3.5" /></>);
/** Código de barras: guias (DAS, DARF). */
export const Barcode = icon("Barcode", <path d="M3.5 5v14M6.5 5v14M9 5v11M11.5 5v14M14.5 5v11M17 5v14M20.5 5v14" />);
/** Código: leitor de XML. */
export const Code = icon("Code", <path d="M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 5l-3 14" />);
/** Pena de caneta: contratos. */
export const PenNib = icon("PenNib", <><path d="M5.5 10.5L12 3l6.5 7.5L15 20.5H9zM12 3v8" /><circle cx="12" cy="13" r="1.6" /></>);
/** Carimbo: legalização. */
export const Stamp = icon("Stamp", <path d="M10 4h4v5h-4zM11 9h2l1 3h5v4H5v-4h5zM5 19.5h14" />);

// ---------------------------------------------------------------- ações
export const Search = icon("Search", <><circle cx="10.5" cy="10.5" r="6" /><path d="M15 15l5 5" /></>);
export const Plus = icon("Plus", <path d="M12 5v14M5 12h14" />);
export const X = icon("X", <path d="M6 6l12 12M18 6L6 18" />);
export const Check = icon("Check", <path d="M5 12.5l4.5 4.5L19 7.5" />);
export const CircleCheck = icon("CircleCheck", <><circle cx="12" cy="12" r="8.5" /><path d="M8.3 12.3l2.6 2.6 4.8-5" /></>);
export const Pencil = icon("Pencil", <path d="M15.5 4.5l4 4L9 19H5v-4zM13.5 6.5l4 4" />);
export const Trash2 = icon("Trash2", <path d="M4.5 6.5h15M9 6.5V4h6v2.5M6.5 6.5l1 14h9l1-14M10.5 10.5v6M13.5 10.5v6" />);
export const UploadCloud = icon("UploadCloud", <path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M4 15v5h16v-5" />);
export const Download = icon("Download", <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M4 15v5h16v-5" />);
export const RotateCcw = icon("RotateCcw", <path d="M4 4.5v5h5M4.6 9.5A8 8 0 1 1 5 15" />);
export const LogOut = icon("LogOut", <path d="M10 4.5H4.5v15H10M15 8l4 4-4 4M19 12H9" />);
export const Menu = icon("Menu", <path d="M4 6.5h16M4 12h16M4 17.5h16" />);
export const LoaderCircle = icon("LoaderCircle", <path d="M12 3.5A8.5 8.5 0 1 0 20.5 12" />);
export const TriangleAlert = icon("TriangleAlert", <path d="M12 4l9 16H3zM12 10v4.5M12 17v.6" />);

// ---------------------------------------------------------------- setas
export const ChevronLeft = icon("ChevronLeft", <path d="M14.5 6l-6 6 6 6" />);
export const ChevronDown = icon("ChevronDown", <path d="M6 9.5l6 6 6-6" />);
export const ArrowUp = icon("ArrowUp", <path d="M12 19V5M6.5 10.5L12 5l5.5 5.5" />);
export const ArrowDown = icon("ArrowDown", <path d="M12 5v14M6.5 13.5L12 19l5.5-5.5" />);
export const ArrowRight = icon("ArrowRight", <path d="M5 12h14M13.5 6.5L19 12l-5.5 5.5" />);
export const ArrowUpDown = icon("ArrowUpDown", <path d="M8 19V5M4.5 8.5L8 5l3.5 3.5M16 5v14M12.5 15.5L16 19l3.5-3.5" />);

// ---------------------------------------------------------------- emissor: documentos
export const FilePlus2 = icon("FilePlus2", <>{sheet}<path d="M12 11v6M9 14h6" /></>);
export const FilePen = icon("FilePen", <><path d="M14 3H6v18h5M14 3v4h4v3" /><path d="M17.5 12.5l3 3-5 5h-3v-3z" /></>);
export const FileCheck2 = icon("FileCheck2", <>{sheet}<path d="M9 14l2 2 4-4.5" /></>);
export const FileCode2 = FileCode;
export const FileOutput = icon("FileOutput", <><path d="M18 11V7l-4-4H6v18h12v-3M14 3v4h4" /><path d="M11 14.5h10M18 11.5l3 3-3 3" /></>);
export const FileUp = icon("FileUp", <>{sheet}<path d="M12 18v-7M9 13.5l3-3 3 3" /></>);
export const ScrollText = icon("ScrollText", <path d="M8 3.5h11v14a3 3 0 01-3 3H6a3 3 0 01-3-3v-2h10v2a3 3 0 006 0M8 3.5v12M11 8h5M11 11.5h5" />);
export const Printer = icon("Printer", <path d="M7 8V3.5h10V8M7 17H3.5V8h17v9H17M7 13.5h10v7H7z" />);
export const Save = icon("Save", <path d="M4 4h12.5L20 7.5V20H4zM8 4v4.5h7V4M7.5 20v-6h9v6" />);
export const CopyPlus = icon("CopyPlus", <path d="M9 9h11v11H9zM15 9V4H4v11h5M14.5 12v5M12 14.5h5" />);
export const History = icon("History", <path d="M4 4.5v5h5M4.6 9.5A8 8 0 1 1 5 15M12 8v4.5l3 2" />);

// ---------------------------------------------------------------- emissor: situação
export const AlertTriangle = TriangleAlert;
export const CircleAlert = icon("CircleAlert", <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v5.5M12 15.8v.6" /></>);
export const CheckCircle2 = CircleCheck;
export const XCircle = icon("XCircle", <><circle cx="12" cy="12" r="8.5" /><path d="M9 9l6 6M15 9l-6 6" /></>);
export const CircleDashed = icon("CircleDashed", <path d="M10.5 3.6a8.5 8.5 0 013 0M17.4 5.4a8.5 8.5 0 012.1 2.1M20.4 10.5a8.5 8.5 0 010 3M18.6 17.4a8.5 8.5 0 01-2.1 2.1M13.5 20.4a8.5 8.5 0 01-3 0M6.6 18.6a8.5 8.5 0 01-2.1-2.1M3.6 13.5a8.5 8.5 0 010-3M5.4 6.6a8.5 8.5 0 012.1-2.1" />);
export const Ban = icon("Ban", <><circle cx="12" cy="12" r="8.5" /><path d="M6 6l12 12" /></>);
export const Clock3 = icon("Clock3", <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5h4" /></>);
export const ShieldAlert = icon("ShieldAlert", <path d="M12 3l7.5 3v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6zM12 8v5M12 15.8v.6" />);
export const MessageSquareWarning = icon("MessageSquareWarning", <path d="M3.5 4.5h17v12H9l-4.5 3.5v-3.5h-1zM12 7.5v4.5M12 14v.5" />);
export const MessageCircleWarning = MessageSquareWarning;
export const WifiOff = icon("WifiOff", <path d="M4 4l16 16M2.5 9a14 14 0 015.3-3M12 5.5a14 14 0 019.5 3.5M5.5 12.5a9 9 0 014.5-2.3M15.5 11a9 9 0 013 1.5M9 16a4.5 4.5 0 016 0M12 19.5v.5" />);
export const KeyRound = icon("KeyRound", <><circle cx="8" cy="15" r="4.5" /><path d="M11.2 11.8L20 3M16.5 6.5l3 3M14 9l2 2" /></>);
export const LockKeyhole = icon("LockKeyhole", <path d="M5 10.5h14V21H5zM8 10.5V7a4 4 0 018 0v3.5M12 14.5v3" />);

// ---------------------------------------------------------------- emissor: ações
export const Eye = icon("Eye", <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>);
export const Send = icon("Send", <path d="M3.5 11.5L20.5 4l-6 16.5-3-6.5zM11.5 14L20.5 4" />);
export const Play = icon("Play", <path d="M7 4.5v15L19.5 12z" />);
export const RefreshCw = icon("RefreshCw", <path d="M20 4.5v5h-5M4 19.5v-5h5M19.4 9.5A8 8 0 005.2 7.5M4.6 14.5a8 8 0 0014.2 2" />);
export const RotateCw = icon("RotateCw", <path d="M20 4.5v5h-5M19.4 9.5A8 8 0 1 0 19 15" />);
export const Repeat2 = icon("Repeat2", <path d="M4 11V7h14M15 4l3 3-3 3M20 13v4H6M9 20l-3-3 3-3" />);
export const Upload = icon("Upload", <path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M4 15v5h16v-5" />);
export const Settings = icon("Settings", <><circle cx="12" cy="12" r="3" /><path d="M10.5 3h3l.5 2.6 1.9 1.1 2.5-.9 1.5 2.6-2 1.7v2.2l2 1.7-1.5 2.6-2.5-.9-1.9 1.1-.5 2.6h-3l-.5-2.6-1.9-1.1-2.5.9-1.5-2.6 2-1.7v-2.2l-2-1.7 1.5-2.6 2.5.9 1.9-1.1z" /></>);
export const Star = icon("Star", <path d="M12 3.5l2.6 5.6 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6-4.5-4.1 6-.7z" />);
export const EllipsisVertical = icon("EllipsisVertical", <path d="M12 5.5v1M12 11.5v1M12 17.5v1" strokeWidth={2.4} />);
export const ArrowLeft = icon("ArrowLeft", <path d="M19 12H5M10.5 6.5L5 12l5.5 5.5" />);
export const ArrowUpRight = icon("ArrowUpRight", <path d="M7 17L17 7M8.5 7H17v8.5" />);
export const ChevronRight = icon("ChevronRight", <path d="M9.5 6l6 6-6 6" />);

// ---------------------------------------------------------------- emissor: pessoas e lugares
export const UserRound = User;
export const UsersRound = Users;
export const UserRoundPlus = UserPlus;
export const Building = icon("Building", <path d="M5 21V3.5h14V21M3 21h18M9 7.5h1.5M13.5 7.5H15M9 11h1.5M13.5 11H15M9 14.5h1.5M13.5 14.5H15M10.5 21v-3h3v3" />);
export const BriefcaseBusiness = icon("BriefcaseBusiness", <path d="M3.5 7.5h17v12h-17zM9 7.5V4.5h6v3M3.5 12.5h17M11 12.5v2h2v-2" />);
export const MapPin = icon("MapPin", <><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0113 0c0 5-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></>);
