export interface EmbedAuthor {
  name: string | null;
  url: string | null;
  icon_url: string | null;
  proxy_icon_url: string | null;
}

export interface EmbedFooter {
  text: string | null;
  icon_url: string | null;
  proxy_icon_url: string | null;
}

export interface EmbedImage {
  url: string;
  proxy_url: string;
  width?: number;
  height?: number;
}

export interface EmbedField {
  name: string;
  value: string;
  inline: boolean;
}

export interface Embed {
  type?: 'rich' | 'image' | 'video' | 'gifv' | 'article' | 'link';
  title?: string;
  description?: string;
  url?: string;
  timestamp?: string | Date;
  color?: number;
  author?: EmbedAuthor;
  thumbnail?: EmbedImage;
  image?: EmbedImage;
  footer?: EmbedFooter;
  fields?: EmbedField[];
}