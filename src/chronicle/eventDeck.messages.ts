import { defineMessages } from '../i18n';

export const eventDeckMessages = defineMessages({
  en: {
    'evt-generous-crop-year.title': 'A generous crop year',
    'evt-generous-crop-year.text':
      'The growers have more wheat than their stores will hold, and the weighbridge queue runs back to the lane. Their cooperative offers a price discount on the crop-year contract if the mill commits early. The saving can stay in the fund or be passed on.',
    'evt-generous-crop-year.choices.bank.label': 'Bank the grower discount',
    'evt-generous-crop-year.choices.bank.effect.result':
      'The early contract is signed and the discount goes into the co-op fund.',
    'evt-generous-crop-year.choices.pass-on.label': 'Pass it on to School Meals',
    'evt-generous-crop-year.choices.pass-on.effect.result':
      'The saving is passed on as a lower price to County School Meals, who notice.',
    'evt-millwrights-workshop.title': 'The travelling millwrights',
    'evt-millwrights-workshop.text':
      'A millwrights’ guild touring the district offers a workshop on roll fluting and gap setting. They need the roller floor for a morning and a contribution towards their travel. Their notes alone are free.',
    'evt-millwrights-workshop.choices.host.label': 'Host the workshop',
    'evt-millwrights-workshop.choices.host.effect.modifier.label': 'Fresh roll settings',
    'evt-millwrights-workshop.choices.host.effect.result':
      'The guild resets the roll gaps with the crew and leaves a marked-up setting sheet.',
    'evt-millwrights-workshop.choices.notes.label': 'Take their notes only',
    'evt-millwrights-workshop.choices.notes.effect.result':
      'The guild leaves a copy of its notes and moves on to the next mill.',
    'evt-off-peak-tariff.title': 'An off-peak tariff trial',
    'evt-off-peak-tariff.text':
      'The distribution network is trialling a cheaper overnight tariff for small industrial sites. Joining is free; a load-shift timer on the cleaning-house motors would let the mill take full advantage. The trial window is short.',
    'evt-off-peak-tariff.choices.timer.label': 'Fit a load-shift timer',
    'evt-off-peak-tariff.choices.timer.effect.modifier.label': 'Off-peak running',
    'evt-off-peak-tariff.choices.timer.effect.result':
      'The timer moves cleaning and conditioning loads into the cheap overnight band.',
    'evt-off-peak-tariff.choices.join.label': 'Join the trial as we are',
    'evt-off-peak-tariff.choices.join.effect.modifier.label': 'Off-peak tariff',
    'evt-off-peak-tariff.choices.join.effect.result':
      'The mill joins the trial and picks up whatever overnight load already falls in the band.',
    'evt-bakers-proving-test.title': 'A good proving test',
    'evt-bakers-proving-test.text':
      'Riverside Bakers’ Cooperative ran a proving test on the last strong white and the loaves stood tall. Its buyer rings to say so and asks whether the bakers might see the mill. A tour costs a morning’s attention and a modest outlay.',
    'evt-bakers-proving-test.choices.tour.label': 'Invite them for a tour',
    'evt-bakers-proving-test.choices.tour.effect.result':
      'The bakers walk the roller floor and leave with a better sense of what the mill can do.',
    'evt-bakers-proving-test.choices.letter.label': 'Thank them by letter',
    'evt-bakers-proving-test.choices.letter.effect.result':
      'A short letter of thanks goes back to Riverside with the next delivery note.',
    'evt-village-work-party.title': 'The village work party',
    'evt-village-work-party.text':
      'The village harvest committee offers a weekend work party to clear the yard drains and the culvert by the millstream. They ask only that the mill feeds them. With the drains clear, a heavy storm is less likely to stop the yard.',
    'evt-village-work-party.choices.accept.label': 'Accept and provide lunch',
    'evt-village-work-party.choices.accept.effect.modifier.label': 'Drains cleared',
    'evt-village-work-party.choices.accept.effect.result':
      'The drains and culvert run clear, and the committee goes home well fed.',
    'evt-village-work-party.choices.decline.label': 'Thank them and decline',
    'evt-village-work-party.choices.decline.effect.result':
      'The committee is thanked and the drains are left for the next maintenance round.',
    'evt-federation-grant.title': 'A modernisation grant',
    'evt-federation-grant.text':
      'The regional federation of cooperatives has a small modernisation grant for member mills that file a full energy and yield return. The return takes careful work from the records. A short return still qualifies for part of the grant.',
    'evt-federation-grant.choices.full.label': 'File the full return',
    'evt-federation-grant.choices.full.effect.result':
      'The federation accepts the full return and pays the whole grant into the fund.',
    'evt-federation-grant.choices.short.label': 'File a short return',
    'evt-federation-grant.choices.short.effect.result':
      'The short return is accepted and part of the grant is paid.',
    'evt-college-test-milling.title': 'Test milling for the college',
    'evt-college-test-milling.text':
      'The agricultural college is trialling new wheat varieties and asks the mill to run its sample lots through the laboratory mill and the main line. The work slows the line for a shift or two. The results come back with the college’s analysis attached.',
    'evt-college-test-milling.choices.run.label': 'Run the test milling',
    'evt-college-test-milling.choices.run.effect.modifier.label': 'Variety trials',
    'evt-college-test-milling.choices.run.effect.result':
      'The samples run through the line and the college shares its full analysis.',
    'evt-college-test-milling.choices.lab.label': 'Share laboratory data only',
    'evt-college-test-milling.choices.lab.effect.result':
      'The laboratory mill runs the samples and the readings go to the college.',
    'evt-wet-intake.title': 'Wet grain at the intake',
    'evt-wet-intake.text':
      'The moisture meter at the intake reads well above safe storage, load after load. Damp wheat bridges in the bins and mills soft and sticky. A mobile dryer can be hired, or the wet lots blended down with drier stored grain.',
    'evt-wet-intake.choices.dryer.label': 'Hire a mobile dryer',
    'evt-wet-intake.choices.dryer.effect.result':
      'The dryer brings the intake down to storage moisture and the wet-year penalty lifts.',
    'evt-wet-intake.choices.blend.label': 'Blend with stored grain',
    'evt-wet-intake.choices.blend.effect.modifier.label': 'Blending runs',
    'evt-wet-intake.choices.blend.effect.result':
      'The wet lots are blended down with drier stored grain; the extra handling slows the line.',
    'evt-wet-intake.choices.mill-on.label': 'Mill it as it comes',
    'evt-wet-intake.choices.mill-on.effect.modifier.label': 'Damp stock',
    'evt-wet-intake.choices.mill-on.effect.result':
      'The wet grain goes through untreated and the sifters blind more often.',
    'evt-low-falling-number.title': 'Low falling numbers',
    'evt-low-falling-number.text':
      'The laboratory’s falling-number test is coming back short: some of the harvest sprouted in the ear before it was cut. Bread from this grain bakes with a sticky crumb. Blending with sound stored grain restores it, at a cost.',
    'evt-low-falling-number.choices.blend.label': 'Blend with sound grain',
    'evt-low-falling-number.choices.blend.effect.result':
      'Sound stored grain is blended in and the falling number is back within the bakers’ range.',
    'evt-low-falling-number.choices.discount.label': 'Ask the growers for a discount',
    'evt-low-falling-number.choices.discount.effect.modifier.label': 'Sprouted grain',
    'evt-low-falling-number.choices.discount.effect.result':
      'The growers accept a discount on the affected lots, which go through unblended.',
    'evt-low-falling-number.choices.mill-on.label': 'Mill it unblended',
    'evt-low-falling-number.choices.mill-on.effect.result':
      'The bakers at Riverside notice the crumb and say so.',
    'evt-sack-delivery-slips.title': 'The sack delivery slips',
    'evt-sack-delivery-slips.text':
      'The paper-sack supplier rings to say this week’s delivery is stuck behind a breakdown at their works. The packers have enough for part of a shift. A rush freight surcharge would bring the delivery forward.',
    'evt-sack-delivery-slips.choices.counted.label': 'Ask the counted supplier for spare bales',
    'evt-sack-delivery-slips.choices.counted.effect.result':
      'The supplier whose count the mill checked sends spare bales from its own store at no charge.',
    'evt-sack-delivery-slips.choices.rush.label': 'Pay the rush freight',
    'evt-sack-delivery-slips.choices.rush.effect.result':
      'The scheduled delivery arrives on time by rush freight and the packers do not stop.',
    'evt-sack-delivery-slips.choices.wait.label': 'Wait for the delivery',
    'evt-sack-delivery-slips.choices.wait.effect.result':
      'The packers run short before the delivery arrives.',
    'evt-lot-notification.title': 'A grower lot notification',
    'evt-lot-notification.text':
      'A grower calls: a neighbouring field was sprayed on a windy day and one of their recent lots may have caught drift. Their own laboratory will take days. A rapid test at the county laboratory would settle it before the formal hold procedure begins.',
    'evt-lot-notification.choices.test.label': 'Pay for a rapid test',
    'evt-lot-notification.choices.test.effect.result':
      'The rapid test comes back clear and the lot is released with a traceability record.',
    'evt-lot-notification.choices.hold.label': 'Hold the lot and call the lab',
    'evt-lot-notification.choices.hold.effect.result':
      'The lot is placed under formal hold and dispatch waits on the traceability review.',
    'evt-lot-notification.choices.mill-on.label': 'Mill it while the grower’s laboratory works',
    'evt-lot-notification.choices.mill-on.effect.modifier.label': 'Unconfirmed lot',
    'evt-lot-notification.choices.mill-on.effect.result':
      'The lot is milled while the grower’s laboratory works, and the county notes that a notified lot went through untested.',
    'evt-haulier-breakdown.title': 'The haulier breaks down',
    'evt-haulier-breakdown.text':
      'Valley Haulage’s lorry for the afternoon collection has broken down on the bypass. Its workshop expects it back tomorrow. A relief lorry can be hired from the next town.',
    'evt-haulier-breakdown.choices.relief.label': 'Hire a relief lorry',
    'evt-haulier-breakdown.choices.relief.effect.result':
      'The relief lorry makes the collection on time.',
    'evt-haulier-breakdown.choices.wait.label': 'Wait for the repair',
    'evt-haulier-breakdown.choices.wait.effect.result':
      'The collection slips and finished goods back up at the loading bay. The haulier remembers the patience.',
    'evt-dull-roll-flutes.title': 'Dull roll flutes',
    'evt-dull-roll-flutes.text':
      'The break rolls on R.M. 101 are drawing more current and the release is falling: the flutes have dulled. Sending both pairs away for refluting is the full answer. The worst pair can go first.',
    'evt-dull-roll-flutes.choices.both.label': 'Reflute both pairs',
    'evt-dull-roll-flutes.choices.both.effect.modifier.label': 'Sharp rolls',
    'evt-dull-roll-flutes.choices.both.effect.result':
      'Both pairs come back sharp and the break release recovers.',
    'evt-dull-roll-flutes.choices.worst.label': 'Reflute the worst pair',
    'evt-dull-roll-flutes.choices.worst.effect.modifier.label': 'Refluted pair',
    'evt-dull-roll-flutes.choices.worst.effect.result':
      'The worst pair is refluted and the motor current settles.',
    'evt-dull-roll-flutes.choices.run-on.label': 'Run them another week',
    'evt-dull-roll-flutes.choices.run-on.effect.modifier.label': 'Dull flutes',
    'evt-dull-roll-flutes.choices.run-on.effect.result':
      'The dull rolls stay in and draw more power for less release.',
    'evt-school-specks.title': 'Specks in the school flour',
    'evt-school-specks.text':
      'County School Meals reports dark specks in a delivery of community flour. It is bran, harmless, but the kitchens have asked questions. They want to know what the mill will do about it.',
    'evt-school-specks.choices.visit.label': 'Send the QC records',
    'evt-school-specks.choices.visit.effect.result':
      'The QC records and sieve analysis go to the kitchens, who are reassured.',
    'evt-school-specks.choices.tighten.label': 'Tighten the sifter covers',
    'evt-school-specks.choices.tighten.effect.modifier.label': 'Finer sifting',
    'evt-school-specks.choices.tighten.effect.result':
      'The sifter covers are changed to a closer mesh, at some cost to throughput.',
    'evt-school-specks.choices.file.label': 'File the complaint',
    'evt-school-specks.choices.file.effect.result':
      'The complaint is filed without an answer, and School Meals notices.',
    'evt-pest-sign.title': 'Pest signs in the bran store',
    'evt-pest-sign.text':
      'The weekly pest walk finds gnawed sacks and droppings in the bran store. The store is next to the packing line. The contracted pest-control firm can proof the building this week.',
    'evt-pest-sign.choices.firm.label': 'Call in the pest firm',
    'evt-pest-sign.choices.firm.effect.result':
      'The firm proofs the store and the gaps under the doors are sealed.',
    'evt-pest-sign.choices.in-house.label': 'Seal the store in-house',
    'evt-pest-sign.choices.in-house.effect.modifier.label': 'Store proofing',
    'evt-pest-sign.choices.in-house.effect.result':
      'The crew seals the store between runs and the line slows while it is done.',
    'evt-pest-sign.choices.note.label': 'Note it for the next visit',
    'evt-pest-sign.choices.note.effect.modifier.label': 'Pest risk',
    'evt-pest-sign.choices.note.effect.result':
      'The signs are noted and the store waits for the next scheduled visit.',
    'evt-inspector-visit.title': 'The food-safety inspector',
    'evt-inspector-visit.text':
      'A food-safety inspector from the county arrives unannounced and asks for the traceability records, the cleaning schedule and a walk of the packing hall. The visit is open until the inspector signs off. How the mill meets it shapes what the report says.',
    'evt-inspector-visit.choices.records.label': 'Walk them through the records',
    'evt-inspector-visit.choices.records.effect.result':
      'The inspector follows a lot from intake to dispatch and signs off with no actions.',
    'evt-inspector-visit.choices.deep-clean.label': 'Deep-clean before the walk',
    'evt-inspector-visit.choices.deep-clean.effect.modifier.label': 'Deep clean',
    'evt-inspector-visit.choices.deep-clean.effect.result':
      'The packing hall is deep-cleaned before the walk and the report is a clean one.',
    'evt-inspector-visit.choices.as-is.label': 'Let the visit run its course',
    'evt-inspector-visit.choices.as-is.effect.modifier.label': 'Inspection actions',
    'evt-inspector-visit.choices.as-is.effect.result':
      'The inspector signs off with a short list of actions to close.',
    'evt-two-buyers-one-slot.title': 'Two buyers, one slot',
    'evt-two-buyers-one-slot.text':
      'Riverside Bakers’ Cooperative and Community Pasta Works both want the early collection slot at the loading bay for the coming week. The bakers want strong white for a festival weekend; the pasta works wants semolina before a menu change. Each asks the mill to put them first.',
    'evt-two-buyers-one-slot.choices.bakers.label': 'Put the bakers first',
    'evt-two-buyers-one-slot.choices.bakers.effect.modifier.label': 'Strong-wheat conditioning',
    'evt-two-buyers-one-slot.choices.bakers.effect.result':
      'The bakers get the early slot; the longer strong-wheat conditioning draws more power.',
    'evt-two-buyers-one-slot.choices.pasta.label': 'Put the pasta works first',
    'evt-two-buyers-one-slot.choices.pasta.effect.modifier.label': 'Durum on the rolls',
    'evt-two-buyers-one-slot.choices.pasta.effect.result':
      'The pasta works gets the early slot; the hard durum is heavier on the rolls.',
    'evt-two-buyers-one-slot.choices.rota.label': 'Keep the booking order',
    'evt-two-buyers-one-slot.choices.rota.effect.result':
      'The slot goes by the booking order and neither buyer is put first.',
    'evt-growers-weighbridge.title': 'Hill farms and valley farms',
    'evt-growers-weighbridge.text':
      'The valley growers and the hill growers are arguing over who goes first at the weighbridge in the harvest rush. The valley farms offer a haulage discount for priority. The hill farms offer the data from their variety trials.',
    'evt-growers-weighbridge.choices.valley.label': 'Give the valley farms priority',
    'evt-growers-weighbridge.choices.valley.effect.modifier.label': 'Valley priority',
    'evt-growers-weighbridge.choices.valley.effect.result':
      'The valley farms go first and the haulage discount is paid; the hill lorries queue on the lane.',
    'evt-growers-weighbridge.choices.hill.label': 'Give the hill farms priority',
    'evt-growers-weighbridge.choices.hill.effect.modifier.label': 'Hill priority',
    'evt-growers-weighbridge.choices.hill.effect.result':
      'The hill farms go first and share their trial data; the bigger valley loads wait.',
    'evt-growers-weighbridge.choices.first-come.label': 'Keep first come, first served',
    'evt-growers-weighbridge.choices.first-come.effect.result':
      'The weighbridge stays first come, first served, and both groups grumble equally.',
    'evt-members-meeting.title': 'The members’ meeting',
    'evt-members-meeting.text':
      'The cooperative’s members meet to settle a motion: raise the share of each shift’s contribution held for reinvestment, or hold it down and keep prices low for the mill’s customers. Both sides have a fair case. The chair can also table the motion.',
    'evt-members-meeting.choices.reinvest.label': 'Raise the reinvestment share',
    'evt-members-meeting.choices.reinvest.effect.modifier.label': 'Members’ reinvestment motion',
    'evt-members-meeting.choices.reinvest.effect.result':
      'The motion carries and more of each shift’s contribution goes to the fund.',
    'evt-members-meeting.choices.prices.label': 'Keep prices low',
    'evt-members-meeting.choices.prices.effect.modifier.label': 'Members’ price motion',
    'evt-members-meeting.choices.prices.effect.result':
      'The members hold prices down; customers notice and the fund grows more slowly.',
    'evt-members-meeting.choices.table.label': 'Table the motion',
    'evt-members-meeting.choices.table.effect.result':
      'The motion is tabled until the next meeting.',
    'evt-demand-response.title': 'A demand-response call',
    'evt-demand-response.text':
      'The grid operator is short of capacity on a cold evening and offers a payment to sites that shed load at the peak. Shedding means slowing the line for a while. Declining costs nothing.',
    'evt-demand-response.choices.shed.label': 'Shed load at the peak',
    'evt-demand-response.choices.shed.effect.modifier.label': 'Load shedding',
    'evt-demand-response.choices.shed.effect.result':
      'The mill slows at the peak and the operator’s payment goes into the fund.',
    'evt-demand-response.choices.decline.label': 'Decline the call',
    'evt-demand-response.choices.decline.effect.result':
      'The mill runs on through the peak at its normal rate.',
  },
  'pt-BR': {
    'evt-generous-crop-year.title': 'Uma safra generosa',
    'evt-generous-crop-year.text':
      'Os produtores têm mais trigo do que seus armazéns comportam, e a fila da balança chega até a estrada. Sua cooperativa oferece desconto no contrato da safra se o moinho fechar o acordo antecipadamente. A economia pode ficar no fundo ou ser repassada.',
    'evt-generous-crop-year.choices.bank.label': 'Guardar o desconto dos produtores',
    'evt-generous-crop-year.choices.bank.effect.result':
      'O contrato antecipado é assinado e o desconto vai para o fundo da cooperativa.',
    'evt-generous-crop-year.choices.pass-on.label': 'Repassar para School Meals',
    'evt-generous-crop-year.choices.pass-on.effect.result':
      'A economia é repassada como redução de preço para County School Meals, que reconhece o gesto.',
    'evt-millwrights-workshop.title': 'Os técnicos de moinhos itinerantes',
    'evt-millwrights-workshop.text':
      'Uma associação de técnicos de moinhos em visita à região oferece uma oficina sobre raiamento de rolos e ajuste de folga. Precisam do setor de moagem por uma manhã e de uma contribuição para a viagem. Apenas as anotações são gratuitas.',
    'evt-millwrights-workshop.choices.host.label': 'Receber a oficina',
    'evt-millwrights-workshop.choices.host.effect.modifier.label': 'Novos ajustes dos rolos',
    'evt-millwrights-workshop.choices.host.effect.result':
      'A associação ajusta as folgas dos rolos com a equipe e deixa uma ficha de regulagem anotada.',
    'evt-millwrights-workshop.choices.notes.label': 'Aceitar apenas as anotações',
    'evt-millwrights-workshop.choices.notes.effect.result':
      'A associação deixa uma cópia das anotações e segue para o próximo moinho.',
    'evt-off-peak-tariff.title': 'Um teste de tarifa fora de ponta',
    'evt-off-peak-tariff.text':
      'A distribuidora está testando uma tarifa noturna mais barata para pequenas indústrias. A adesão é gratuita; um temporizador nos motores do setor de limpeza permitiria aproveitar toda a vantagem. O prazo do teste é curto.',
    'evt-off-peak-tariff.choices.timer.label': 'Instalar um temporizador de carga',
    'evt-off-peak-tariff.choices.timer.effect.modifier.label': 'Operação fora de ponta',
    'evt-off-peak-tariff.choices.timer.effect.result':
      'O temporizador transfere as cargas de limpeza e condicionamento para o horário noturno mais barato.',
    'evt-off-peak-tariff.choices.join.label': 'Aderir ao teste como estamos',
    'evt-off-peak-tariff.choices.join.effect.modifier.label': 'Tarifa fora de ponta',
    'evt-off-peak-tariff.choices.join.effect.result':
      'O moinho adere ao teste e aproveita as cargas que já ocorrem no horário noturno mais barato.',
    'evt-bakers-proving-test.title': 'Um bom teste de fermentação',
    'evt-bakers-proving-test.text':
      'Riverside Bakers’ Cooperative fez um teste de fermentação com a última farinha branca forte, e os pães cresceram bem. Seu comprador liga para contar e pergunta se os padeiros podem visitar o moinho. A visita exige uma manhã de atenção e um pequeno gasto.',
    'evt-bakers-proving-test.choices.tour.label': 'Convidá-los para uma visita',
    'evt-bakers-proving-test.choices.tour.effect.result':
      'Os padeiros visitam o setor de moagem e saem entendendo melhor o que o moinho pode fazer.',
    'evt-bakers-proving-test.choices.letter.label': 'Agradecer por carta',
    'evt-bakers-proving-test.choices.letter.effect.result':
      'Uma breve carta de agradecimento segue para Riverside com a próxima nota de entrega.',
    'evt-village-work-party.title': 'O mutirão da vila',
    'evt-village-work-party.text':
      'O comitê da colheita da vila oferece um mutirão no fim de semana para limpar os drenos do pátio e o bueiro junto ao canal do moinho. Pedem apenas que o moinho forneça a comida. Com os drenos livres, uma tempestade forte tem menos chance de parar o pátio.',
    'evt-village-work-party.choices.accept.label': 'Aceitar e oferecer almoço',
    'evt-village-work-party.choices.accept.effect.modifier.label': 'Drenos desobstruídos',
    'evt-village-work-party.choices.accept.effect.result':
      'Os drenos e o bueiro ficam livres, e o comitê volta para casa bem alimentado.',
    'evt-village-work-party.choices.decline.label': 'Agradecer e recusar',
    'evt-village-work-party.choices.decline.effect.result':
      'O comitê recebe os agradecimentos, e os drenos ficam para a próxima rodada de manutenção.',
    'evt-federation-grant.title': 'Um subsídio para modernização',
    'evt-federation-grant.text':
      'A federação regional de cooperativas oferece um pequeno subsídio de modernização aos moinhos associados que apresentarem um relatório completo de energia e rendimento. Prepará-lo exige uma análise cuidadosa dos registros. Um relatório resumido ainda dá direito a parte do subsídio.',
    'evt-federation-grant.choices.full.label': 'Entregar o relatório completo',
    'evt-federation-grant.choices.full.effect.result':
      'A federação aceita o relatório completo e deposita todo o subsídio no fundo.',
    'evt-federation-grant.choices.short.label': 'Entregar um relatório resumido',
    'evt-federation-grant.choices.short.effect.result':
      'O relatório resumido é aceito e parte do subsídio é paga.',
    'evt-college-test-milling.title': 'Moagem experimental para a faculdade',
    'evt-college-test-milling.text':
      'A faculdade de agronomia está testando novas variedades de trigo e pede ao moinho que processe seus lotes de amostra no moinho de laboratório e na linha principal. O trabalho reduz o ritmo da linha por um ou dois turnos. Os resultados voltam acompanhados da análise da faculdade.',
    'evt-college-test-milling.choices.run.label': 'Fazer a moagem experimental',
    'evt-college-test-milling.choices.run.effect.modifier.label': 'Testes de variedades',
    'evt-college-test-milling.choices.run.effect.result':
      'As amostras passam pela linha e a faculdade compartilha sua análise completa.',
    'evt-college-test-milling.choices.lab.label': 'Compartilhar apenas os dados do laboratório',
    'evt-college-test-milling.choices.lab.effect.result':
      'O moinho de laboratório processa as amostras e as medições seguem para a faculdade.',
    'evt-wet-intake.title': 'Grãos úmidos na recepção',
    'evt-wet-intake.text':
      'O medidor de umidade na recepção indica valores muito acima do limite seguro de armazenamento, carga após carga. O trigo úmido forma pontes nos silos e fica mole e pegajoso na moagem. É possível alugar um secador móvel ou misturar os lotes úmidos com grãos mais secos do estoque.',
    'evt-wet-intake.choices.dryer.label': 'Alugar um secador móvel',
    'evt-wet-intake.choices.dryer.effect.result':
      'O secador reduz a umidade do trigo recebido ao nível de armazenamento e elimina a penalidade da safra úmida.',
    'evt-wet-intake.choices.blend.label': 'Misturar com grãos do estoque',
    'evt-wet-intake.choices.blend.effect.modifier.label': 'Misturas em processamento',
    'evt-wet-intake.choices.blend.effect.result':
      'Os lotes úmidos são misturados com grãos mais secos do estoque; o manuseio extra reduz o ritmo da linha.',
    'evt-wet-intake.choices.mill-on.label': 'Moer como vier',
    'evt-wet-intake.choices.mill-on.effect.modifier.label': 'Estoque úmido',
    'evt-wet-intake.choices.mill-on.effect.result':
      'Os grãos úmidos são processados sem tratamento e as peneiras entopem com mais frequência.',
    'evt-low-falling-number.title': 'Baixo número de queda',
    'evt-low-falling-number.text':
      'O teste de número de queda do laboratório está abaixo do esperado: parte da colheita germinou na espiga antes do corte. O pão feito com esses grãos fica com miolo pegajoso. Misturá-los com grãos sadios do estoque corrige o problema, com um custo.',
    'evt-low-falling-number.choices.blend.label': 'Misturar com grãos sadios',
    'evt-low-falling-number.choices.blend.effect.result':
      'Grãos sadios do estoque são incorporados e o número de queda volta à faixa exigida pelos padeiros.',
    'evt-low-falling-number.choices.discount.label': 'Pedir desconto aos produtores',
    'evt-low-falling-number.choices.discount.effect.modifier.label': 'Grãos germinados',
    'evt-low-falling-number.choices.discount.effect.result':
      'Os produtores aceitam dar desconto nos lotes afetados, que seguem para a moagem sem mistura.',
    'evt-low-falling-number.choices.mill-on.label': 'Moer sem misturar',
    'evt-low-falling-number.choices.mill-on.effect.result':
      'Os padeiros de Riverside percebem o problema no miolo e reclamam.',
    'evt-sack-delivery-slips.title': 'A entrega de sacos atrasa',
    'evt-sack-delivery-slips.text':
      'O fornecedor de sacos de papel liga para avisar que a entrega desta semana está presa por uma pane na fábrica. As ensacadeiras têm sacos para apenas parte de um turno. Um adicional de frete urgente anteciparia a entrega.',
    'evt-sack-delivery-slips.choices.counted.label': 'Pedir fardos extras ao fornecedor conferido',
    'evt-sack-delivery-slips.choices.counted.effect.result':
      'O fornecedor cuja contagem foi conferida pelo moinho envia fardos extras do próprio estoque sem cobrar.',
    'evt-sack-delivery-slips.choices.rush.label': 'Pagar o frete urgente',
    'evt-sack-delivery-slips.choices.rush.effect.result':
      'A entrega programada chega a tempo com o frete urgente e as ensacadeiras não param.',
    'evt-sack-delivery-slips.choices.wait.label': 'Esperar a entrega',
    'evt-sack-delivery-slips.choices.wait.effect.result':
      'As ensacadeiras ficam sem sacos antes da entrega chegar.',
    'evt-lot-notification.title': 'Um aviso sobre um lote de produtor',
    'evt-lot-notification.text':
      'Um produtor liga: um campo vizinho foi pulverizado em um dia de vento, e um de seus lotes recentes pode ter recebido deriva. Seu próprio laboratório levará dias. Um teste rápido no laboratório do condado resolveria a dúvida antes do início do procedimento formal de retenção.',
    'evt-lot-notification.choices.test.label': 'Pagar por um teste rápido',
    'evt-lot-notification.choices.test.effect.result':
      'O teste rápido não encontra problemas e o lote é liberado com um registro de rastreabilidade.',
    'evt-lot-notification.choices.hold.label': 'Reter o lote e chamar o laboratório',
    'evt-lot-notification.choices.hold.effect.result':
      'O lote fica sob retenção formal e a expedição aguarda a análise de rastreabilidade.',
    'evt-lot-notification.choices.mill-on.label': 'Moer enquanto o laboratório do produtor analisa',
    'evt-lot-notification.choices.mill-on.effect.modifier.label': 'Lote não confirmado',
    'evt-lot-notification.choices.mill-on.effect.result':
      'O lote é moído enquanto o laboratório do produtor analisa, e o condado registra que um lote notificado foi processado sem teste.',
    'evt-haulier-breakdown.title': 'O caminhão da transportadora quebra',
    'evt-haulier-breakdown.text':
      'O caminhão de Valley Haulage para a coleta da tarde quebrou no contorno rodoviário. A oficina prevê seu retorno amanhã. É possível contratar um caminhão substituto na cidade vizinha.',
    'evt-haulier-breakdown.choices.relief.label': 'Contratar um caminhão substituto',
    'evt-haulier-breakdown.choices.relief.effect.result':
      'O caminhão substituto faz a coleta no horário.',
    'evt-haulier-breakdown.choices.wait.label': 'Esperar o conserto',
    'evt-haulier-breakdown.choices.wait.effect.result':
      'A coleta atrasa e os produtos acabados se acumulam na doca de carregamento. A transportadora se lembra da paciência.',
    'evt-dull-roll-flutes.title': 'Raiamento dos rolos desgastado',
    'evt-dull-roll-flutes.text':
      'Os rolos de ruptura de R.M. 101 estão consumindo mais corrente e liberando menos material: o raiamento perdeu o corte. Enviar os dois pares para refazer o raiamento resolve por completo. O par mais gasto pode ir primeiro.',
    'evt-dull-roll-flutes.choices.both.label': 'Refazer o raiamento dos dois pares',
    'evt-dull-roll-flutes.choices.both.effect.modifier.label': 'Rolos afiados',
    'evt-dull-roll-flutes.choices.both.effect.result':
      'Os dois pares voltam afiados e a liberação na ruptura se recupera.',
    'evt-dull-roll-flutes.choices.worst.label': 'Refazer o raiamento do pior par',
    'evt-dull-roll-flutes.choices.worst.effect.modifier.label': 'Par com raiamento renovado',
    'evt-dull-roll-flutes.choices.worst.effect.result':
      'O raiamento do pior par é refeito e a corrente do motor se estabiliza.',
    'evt-dull-roll-flutes.choices.run-on.label': 'Usar por mais uma semana',
    'evt-dull-roll-flutes.choices.run-on.effect.modifier.label': 'Raiamento gasto',
    'evt-dull-roll-flutes.choices.run-on.effect.result':
      'Os rolos gastos continuam em uso e consomem mais energia para liberar menos material.',
    'evt-school-specks.title': 'Pontos escuros na farinha da escola',
    'evt-school-specks.text':
      'County School Meals relata pontos escuros em uma entrega de farinha comunitária. É farelo, inofensivo, mas as cozinhas fizeram perguntas. Querem saber o que o moinho fará a respeito.',
    'evt-school-specks.choices.visit.label': 'Enviar os registros de CQ',
    'evt-school-specks.choices.visit.effect.result':
      'Os registros de CQ e a análise de peneiramento seguem para as cozinhas, que ficam tranquilizadas.',
    'evt-school-specks.choices.tighten.label': 'Usar telas mais finas nos plansifters',
    'evt-school-specks.choices.tighten.effect.modifier.label': 'Peneiramento mais fino',
    'evt-school-specks.choices.tighten.effect.result':
      'As telas dos plansifters são trocadas por malhas mais fechadas, com alguma perda de capacidade.',
    'evt-school-specks.choices.file.label': 'Arquivar a reclamação',
    'evt-school-specks.choices.file.effect.result':
      'A reclamação é arquivada sem resposta, e School Meals percebe.',
    'evt-pest-sign.title': 'Sinais de pragas no depósito de farelo',
    'evt-pest-sign.text':
      'A inspeção semanal de pragas encontra sacos roídos e fezes no depósito de farelo. O depósito fica ao lado da linha de ensaque. A empresa de controle de pragas contratada pode vedar o prédio nesta semana.',
    'evt-pest-sign.choices.firm.label': 'Chamar a empresa de controle de pragas',
    'evt-pest-sign.choices.firm.effect.result':
      'A empresa protege o depósito e veda as frestas sob as portas.',
    'evt-pest-sign.choices.in-house.label': 'Vedar o depósito com a equipe interna',
    'evt-pest-sign.choices.in-house.effect.modifier.label': 'Vedação do depósito',
    'evt-pest-sign.choices.in-house.effect.result':
      'A equipe veda o depósito entre as operações e a linha reduz o ritmo durante o serviço.',
    'evt-pest-sign.choices.note.label': 'Anotar para a próxima visita',
    'evt-pest-sign.choices.note.effect.modifier.label': 'Risco de pragas',
    'evt-pest-sign.choices.note.effect.result':
      'Os sinais são registrados e o depósito aguarda a próxima visita programada.',
    'evt-inspector-visit.title': 'A inspeção de segurança dos alimentos',
    'evt-inspector-visit.text':
      'Um inspetor de segurança dos alimentos do condado chega sem aviso e pede os registros de rastreabilidade, o cronograma de limpeza e uma visita ao salão de ensaque. A visita permanece aberta até sua aprovação. A forma como o moinho o recebe molda o relatório.',
    'evt-inspector-visit.choices.records.label': 'Apresentar os registros em detalhe',
    'evt-inspector-visit.choices.records.effect.result':
      'O inspetor acompanha um lote da recepção à expedição e encerra a inspeção sem pendências.',
    'evt-inspector-visit.choices.deep-clean.label': 'Fazer uma limpeza profunda antes da visita',
    'evt-inspector-visit.choices.deep-clean.effect.modifier.label': 'Limpeza profunda',
    'evt-inspector-visit.choices.deep-clean.effect.result':
      'O salão de ensaque recebe uma limpeza profunda antes da visita e o relatório sai sem pendências.',
    'evt-inspector-visit.choices.as-is.label': 'Deixar a visita seguir seu curso',
    'evt-inspector-visit.choices.as-is.effect.modifier.label': 'Ações da inspeção',
    'evt-inspector-visit.choices.as-is.effect.result':
      'O inspetor encerra a visita com uma breve lista de ações a concluir.',
    'evt-two-buyers-one-slot.title': 'Dois compradores, um horário',
    'evt-two-buyers-one-slot.text':
      'Riverside Bakers’ Cooperative e Community Pasta Works querem o primeiro horário de coleta na doca na próxima semana. Os padeiros querem farinha branca forte para um festival de fim de semana; a fábrica de massas quer sêmola antes de mudar o cardápio. Cada um pede prioridade ao moinho.',
    'evt-two-buyers-one-slot.choices.bakers.label': 'Priorizar os padeiros',
    'evt-two-buyers-one-slot.choices.bakers.effect.modifier.label':
      'Condicionamento de trigo forte',
    'evt-two-buyers-one-slot.choices.bakers.effect.result':
      'Os padeiros ficam com o primeiro horário; o condicionamento mais longo do trigo forte consome mais energia.',
    'evt-two-buyers-one-slot.choices.pasta.label': 'Priorizar a fábrica de massas',
    'evt-two-buyers-one-slot.choices.pasta.effect.modifier.label': 'Trigo durum nos rolos',
    'evt-two-buyers-one-slot.choices.pasta.effect.result':
      'A fábrica de massas fica com o primeiro horário; o durum duro exige mais dos rolos.',
    'evt-two-buyers-one-slot.choices.rota.label': 'Manter a ordem das reservas',
    'evt-two-buyers-one-slot.choices.rota.effect.result':
      'O horário segue a ordem das reservas e nenhum comprador recebe prioridade.',
    'evt-growers-weighbridge.title': 'Fazendas das colinas e do vale',
    'evt-growers-weighbridge.text':
      'Os produtores do vale e das colinas discutem quem deve passar primeiro pela balança no pico da colheita. As fazendas do vale oferecem desconto no transporte em troca de prioridade. As fazendas das colinas oferecem os dados de seus testes de variedades.',
    'evt-growers-weighbridge.choices.valley.label': 'Dar prioridade às fazendas do vale',
    'evt-growers-weighbridge.choices.valley.effect.modifier.label': 'Prioridade ao vale',
    'evt-growers-weighbridge.choices.valley.effect.result':
      'As fazendas do vale passam primeiro e o desconto no transporte é pago; os caminhões das colinas fazem fila na estrada.',
    'evt-growers-weighbridge.choices.hill.label': 'Dar prioridade às fazendas das colinas',
    'evt-growers-weighbridge.choices.hill.effect.modifier.label': 'Prioridade às colinas',
    'evt-growers-weighbridge.choices.hill.effect.result':
      'As fazendas das colinas passam primeiro e compartilham os dados dos testes; as cargas maiores do vale aguardam.',
    'evt-growers-weighbridge.choices.first-come.label': 'Manter a ordem de chegada',
    'evt-growers-weighbridge.choices.first-come.effect.result':
      'A balança mantém a ordem de chegada e os dois grupos reclamam por igual.',
    'evt-members-meeting.title': 'A assembleia dos cooperados',
    'evt-members-meeting.text':
      'Os cooperados se reúnem para decidir uma proposta: aumentar a parcela da contribuição de cada turno destinada ao reinvestimento ou mantê-la baixa para preservar os preços aos clientes do moinho. Os dois lados têm argumentos justos. A coordenação também pode adiar a proposta.',
    'evt-members-meeting.choices.reinvest.label': 'Aumentar a parcela de reinvestimento',
    'evt-members-meeting.choices.reinvest.effect.modifier.label':
      'Proposta de reinvestimento dos cooperados',
    'evt-members-meeting.choices.reinvest.effect.result':
      'A proposta é aprovada e uma parcela maior da contribuição de cada turno vai para o fundo.',
    'evt-members-meeting.choices.prices.label': 'Manter os preços baixos',
    'evt-members-meeting.choices.prices.effect.modifier.label': 'Proposta de preços dos cooperados',
    'evt-members-meeting.choices.prices.effect.result':
      'Os cooperados mantêm os preços baixos; os clientes percebem e o fundo cresce mais devagar.',
    'evt-members-meeting.choices.table.label': 'Adiar a proposta',
    'evt-members-meeting.choices.table.effect.result':
      'A proposta fica adiada até a próxima assembleia.',
    'evt-demand-response.title': 'Um chamado de resposta à demanda',
    'evt-demand-response.text':
      'O operador da rede está com pouca capacidade em uma noite fria e oferece pagamento às instalações que reduzirem a carga no pico. Reduzir a carga exige diminuir o ritmo da linha por um tempo. Recusar não custa nada.',
    'evt-demand-response.choices.shed.label': 'Reduzir a carga no pico',
    'evt-demand-response.choices.shed.effect.modifier.label': 'Redução de carga',
    'evt-demand-response.choices.shed.effect.result':
      'O moinho reduz o ritmo no pico e o pagamento do operador vai para o fundo.',
    'evt-demand-response.choices.decline.label': 'Recusar o chamado',
    'evt-demand-response.choices.decline.effect.result':
      'O moinho atravessa o pico operando no ritmo normal.',
  },
});
