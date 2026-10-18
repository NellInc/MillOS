import { defineMessages } from '../../i18n';

export const datalinksMessages = defineMessages({
  en: {
    title: 'DATALINKS',
    subtitle: 'Mill field guide',
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
    welcomeQuote: '"Alignment isn\'t something you do TO AI. It\'s something you build WITH AI."',
    welcomeQuoteSource: '— Bilateral Alignment',
    welcomeBody:
      'Field notes on how this mill thinks: where every kilo came from, why an alarm fired, how a repair earns its restart, and the evidence behind each autonomous decision.',
    selectEntry: 'Select an entry to begin',
  },
  'pt-BR': {
    title: 'DATALINKS',
    subtitle: 'Guia de campo do moinho',
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
    welcomeQuote: '"Alinhamento não é algo que se impõe À IA. É algo que se constrói COM a IA."',
    welcomeQuoteSource: '— Alinhamento Bilateral',
    welcomeBody:
      'Notas de campo sobre como este moinho pensa: de onde veio cada quilo, por que um alarme disparou, como um reparo conquista o direito de religar e as evidências por trás de cada decisão autônoma.',
    selectEntry: 'Selecione um verbete para começar',
  },
});
