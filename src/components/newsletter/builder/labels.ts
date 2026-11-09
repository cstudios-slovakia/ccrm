import type { BlockType, RowLayout, SocialNetwork } from './types.ts';
import type { TFn } from '../../../utils/timeTracking';

export const blockLabel = (t: TFn, type: BlockType): string => {
  switch (type) {
    case 'text':
      return t('Text', 'Text', 'Szöveg');
    case 'heading':
      return t('Heading', 'Nadpis', 'Címsor');
    case 'image':
      return t('Image', 'Obrázok', 'Kép');
    case 'button':
      return t('Button', 'Tlačidlo', 'Gomb');
    case 'divider':
      return t('Divider', 'Oddeľovač', 'Elválasztó');
    case 'spacer':
      return t('Spacer', 'Medzera', 'Térköz');
    case 'social':
      return t('Social', 'Sociálne siete', 'Közösségi');
    case 'html':
      return 'HTML';
  }
};

export const layoutLabel = (t: TFn, layout: RowLayout): string => {
  switch (layout) {
    case '1':
      return t('1 column', '1 stĺpec', '1 oszlop');
    case '1-1':
      return t('2 columns', '2 stĺpce', '2 oszlop');
    case '1-2':
      return t('Narrow + wide', 'Úzky + široký', 'Keskeny + széles');
    case '2-1':
      return t('Wide + narrow', 'Široký + úzky', 'Széles + keskeny');
    case '1-1-1':
      return t('3 columns', '3 stĺpce', '3 oszlop');
  }
};

export const networkLabel = (network: SocialNetwork): string =>
  ({ facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn', x: 'X', youtube: 'YouTube', tiktok: 'TikTok', website: 'Website' })[network];
