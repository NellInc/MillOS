import { defineMessages } from '../i18n';

/*
 * Customer names as the player reads them. They are proper names, so each
 * reads the same in both languages (src/i18n/GLOSSARY.md, never translated);
 * the catalogue holds both so a name can be localised without a code change.
 *
 * The maize-meal customer. The plant mills this product from the corn silo
 * (materialFlowStore: corn to "semolina" at 65%), and semolina is a durum wheat
 * product, so it is not sold to a pasta works:
 * - 21 CFR 137.320 (US standard of identity): "Semolina is the food prepared
 *   by grinding and bolting cleaned durum wheat".
 * - 21 CFR 137.250 and 137.275: white and yellow "corn meal" is "the food
 *   prepared by so grinding cleaned white [yellow] corn".
 * - Embrapa, Documentos 59, "Protocolo de Qualidade de Milho" (MAPA, 2004):
 *   dry milling of maize yields "creme de milho, fubá, grits, canjiquinha,
 *   cuscuz, polenta". ANVISA IN 351/2025 lists "fubá" among maize products.
 * (The Codex standards CXS 178 and CXS 155 could not be fetched.)
 * A polenta kitchen buys maize meal. The stored name stays "Community Pasta
 * Works": it is the saved, canonical value the Chronicle matches on.
 */
export const customerNameMessages = defineMessages({
  en: {
    riverside: "Riverside Bakers' Cooperative",
    maizeMeal: 'Community Polenta Kitchen',
    school: 'County School Meals',
  },
  'pt-BR': {
    riverside: "Riverside Bakers' Cooperative",
    maizeMeal: 'Community Polenta Kitchen',
    school: 'County School Meals',
  },
});
