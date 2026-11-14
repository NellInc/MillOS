import { defineMessages } from '../../i18n';

export const datalinksMessages = defineMessages({
  en: {
    title: 'DATALINKS',
    entryCount: (p: { count: string; n: number }) => `${p.count} entries`,
    close: 'Close',
    guideSection: 'Guide section',
    operatingGuide: 'Operating guide',
    developerReference: 'Developer reference',
    searchPlaceholder: 'Search...',
    searchLabel: 'Search knowledge entries',
    all: 'All',
    newBadge: 'NEW',
    noMatch: 'No entries match "{query}"',
    noEntriesInCategory: 'No entries in this category',
    clearSearch: 'Clear search',
    welcome: 'WELCOME TO THE DATALINKS',
  },
  'pt-BR': {
    title: 'DATALINKS',
    entryCount: (p: { count: string; n: number }) =>
      `${p.count} ${p.n === 1 ? 'verbete' : 'verbetes'}`,
    close: 'Fechar',
    guideSection: 'Seção do guia',
    operatingGuide: 'Guia de operação',
    developerReference: 'Referência para desenvolvedores',
    searchPlaceholder: 'Buscar...',
    searchLabel: 'Buscar verbetes de conhecimento',
    all: 'Todos',
    newBadge: 'NOVO',
    noMatch: 'Nenhum verbete corresponde a "{query}"',
    noEntriesInCategory: 'Nenhum verbete nesta categoria',
    clearSearch: 'Limpar busca',
    welcome: 'BOAS-VINDAS AOS DATALINKS',
  },
});
