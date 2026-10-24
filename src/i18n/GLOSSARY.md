# MillOS pt-BR glossary

One vocabulary for every translated file. Audience: Brazilian cooperative
leaders (WCM'26). Brazilian Portuguese only, never European Portuguese.

## Register and style

- Address the reader as **você**, never _tu_. Avoid _vós_, _contacto_, _ecrã_,
  _utilizador_, _registo_ (European forms). Use _contato_, _tela_, _usuário_,
  _registro_.
- Buttons and actions: imperative, sentence case, short. _Abrir_, _Fechar_,
  _Voltar_, _Avançar_, _Mostrar_, _Confirmar_, _Cancelar_, _Pular_.
- Keep the casing pattern of the English (an UPPERCASE English label stays
  uppercase in Portuguese).
- Keep the tone: plain, concrete, calm, no hype. MillOS copy is careful about
  what is measured versus advised; keep those distinctions exact.
- Gender: use _cooperados_ for members in general, _cada cooperado_ for one.
  Do not write _cooperado(a)_ in running copy.

## Numbers, units and time

- Every number in translated copy goes through `formatFixed(value, digits)`
  (replacement for `value.toFixed(digits)`) or `formatGrouped(value, opts)`
  (replacement for `toLocaleString`). pt-BR reads "6,000 kg" as six kilograms:
  it must render "6.000 kg"; decimals use a comma ("2,5 t/h").
- Units stay as symbols: kg, t, t/h, °C, mm/s, RPM, %, km/h.
- Durations: "3h 43m" becomes "3h 43min"; "minute 30" becomes "minuto 30".
- Clock times stay 24-hour ("14:04").

## Mill and operations

| English                     | pt-BR                                      |
| --------------------------- | ------------------------------------------ |
| mill (the site)             | moinho                                     |
| roller mill                 | moinho de rolos                            |
| plansifter                  | plansifter                                 |
| packer / packing line       | ensacadeira / linha de ensaque             |
| silo                        | silo                                       |
| conveyor                    | transportador / esteira                    |
| forklift                    | empilhadeira                               |
| truck                       | caminhão                                   |
| receiving (dock/truck)      | recebimento (doca/caminhão de recebimento) |
| shipping / dispatch         | expedição                                  |
| dock                        | doca                                       |
| departure / departed        | saída / saiu                               |
| manifest                    | romaneio                                   |
| order                       | pedido                                     |
| customer                    | cliente                                    |
| due / deadline              | prazo                                      |
| overdue                     | atrasado                                   |
| batch / lot                 | lote                                       |
| quality control (QC)        | controle de qualidade (CQ)                 |
| quality hold                | retenção de qualidade                      |
| release (a batch)           | liberar / liberação                        |
| recipe                      | receita                                    |
| setpoint                    | setpoint                                   |
| throughput                  | vazão                                      |
| bags/h                      | sacos/h                                    |
| bag / sack                  | saco                                       |
| target                      | meta                                       |
| buffer                      | estoque intermediário                      |
| bottleneck                  | gargalo                                    |
| shift                       | turno                                      |
| shift review                | revisão do turno                           |
| shift pace                  | ritmo do turno                             |
| paused / relaxed / standard | pausado / tranquilo / padrão               |
| maintenance                 | manutenção                                 |
| breakdown                   | pane                                       |
| wear                        | desgaste                                   |
| work order                  | ordem de serviço                           |
| spare parts                 | peças de reposição                         |
| alarm / acknowledge         | alarme / reconhecer                        |
| critical / warning          | crítico / alerta                           |
| safety                      | segurança                                  |
| emergency stop              | parada de emergência                       |
| fire drill / egress         | simulado de evacuação / rota de saída      |
| near miss                   | quase acidente                             |
| incident                    | ocorrência                                 |
| SCADA, tags, historian      | SCADA, tags, histórico                     |
| strong white bread flour    | farinha de trigo forte para pão            |
| semolina                    | semolina                                   |
| community flour             | farinha comunitária                        |
| wheat / corn                | trigo / milho                              |

## Cooperative and workplace

| English                   | pt-BR                                    |
| ------------------------- | ---------------------------------------- |
| cooperative / co-op       | cooperativa                              |
| member                    | cooperado                                |
| member review             | avaliação dos cooperados                 |
| surplus                   | sobras                                   |
| distribute surplus        | distribuir as sobras / rateio das sobras |
| retain (in cash)          | reter em caixa                           |
| allocate to the community | destinar à comunidade                    |
| ballot / vote             | votação / voto                           |
| meeting / assembly        | assembleia                               |
| chair                     | coordenação                              |
| charter                   | estatuto                                 |
| working agreement         | acordo de trabalho                       |
| role / role holder        | função / responsável pela função         |
| handover / handoff        | passagem de função / passagem de turno   |
| briefing                  | briefing                                 |
| consent                   | consentimento                            |
| pay / wages               | remuneração                              |
| rest / break              | descanso / pausa                         |
| recovery time             | tempo de recuperação                     |
| objection / challenge     | objeção / contestação                    |
| proposal                  | proposta                                 |
| decision                  | decisão                                  |
| fairness                  | equidade                                 |
| take over                 | assumir                                  |
| campaign / season         | campanha / temporada                     |
| learning review           | revisão de aprendizado                   |
| teach-back                | explicação de volta                      |

## AI and the interface

| English                                              | pt-BR                                                          |
| ---------------------------------------------------- | -------------------------------------------------------------- |
| Bilateral Autonomy System (BAS)                      | Sistema de Autonomia Bilateral (BAS)                           |
| autonomy                                             | autonomia                                                      |
| AI partner                                           | parceiro de IA                                                 |
| agent                                                | agente                                                         |
| advice / forecast / rehearsal / observed result      | recomendação / previsão / ensaio / resultado observado         |
| Getting started                                      | Primeiros passos                                               |
| Overview / Production / Autonomy / Safety / Settings | Visão geral / Produção / Autonomia / Segurança / Configurações |
| Now playing / playlist                               | Tocando agora / lista de reprodução                            |
| replay (decision, diagnostic, workplace)             | reprodução (never "replay")                                    |
| Notifications                                        | Notificações                                                   |
| graphics quality low / medium / high / ultra         | qualidade gráfica baixa / média / alta / ultra                 |
| Reset Simulation                                     | Reiniciar simulação                                            |
| credits (money)                                      | créditos                                                       |
| first-person view                                    | visão em primeira pessoa                                       |

## Never translate

SCADA tag IDs and engineering units; machine designations (R.M. 101,
Silo Alpha, Plansifter A, Line 1); proper names of people, places, brands and
customers (Riverside Bakers' Cooperative); soundtrack song titles and lyrics;
painted in-world signage; console, logger and developer-only error strings;
agent-protocol command names, schemas and machine-readable fields; test IDs,
CSS classes, keys and URLs.
