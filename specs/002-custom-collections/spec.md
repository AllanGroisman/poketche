# Feature Specification: Coleções Personalizadas

**Feature Branch**: `002-custom-collections`

**Created**: 2026-07-20

**Status**: Draft

**Input**: User description: "Adicione a funcionalidade de Coleções Personalizadas (pastas de organização), como uma feature nova sobre o inventário já existente. O usuário pode criar várias coleções personalizadas nomeadas como recortes do seu inventário (criar, renomear, excluir — excluir não remove cartas do inventário). Uma mesma carta pode pertencer a várias coleções (muitos-para-muitos, sem duplicar no inventário). Cada coleção exibe estatísticas próprias do recorte (contagem e valor total), separadas das estatísticas gerais. A tela principal lista as coleções mais o acesso ao inventário completo. Fora de escopo: comportamentos automáticos das coleções. Revisar consistência com inventário (US2), estatísticas (US4) e wishlists, e definir prioridade."

## Clarifications

### Session 2026-07-20

- Q: O que significa a "quantidade de cartas" exibida por uma coleção — cartas distintas, unidades, ou ambos? → A: Ambos, como no dashboard geral (US4): nº de cartas distintas **e** nº de unidades (soma das quantidades).
- Q: As coleções personalizadas devem aparecer no compartilhamento público ou são privadas nesta fase? → A: Podem ser compartilhadas publicamente por links específicos por coleção, para o usuário mostrar um recorte a outra pessoa (respeitando as flags de visibilidade existentes).

## User Scenarios & Testing _(mandatory)_

<!--
  Coleções Personalizadas são recortes do inventário já existente. O inventário completo
  permanece a fonte de verdade e a base das estatísticas gerais — nada disso muda.
  Cada story abaixo é independentemente testável sobre o inventário existente.
-->

### User Story 1 - Organizar o inventário em coleções personalizadas (Priority: P3)

Como colecionador com um inventário grande, quero criar pastas nomeadas (ex.: "Só Charizards", "Base Set", "Favoritas") para organizar minhas cartas em grupos que fazem sentido para mim, podendo renomear e excluir essas pastas conforme minha organização evolui. Excluir uma pasta apaga apenas o agrupamento — as cartas continuam no meu inventário.

**Why this priority**: É a fundação da feature (não há o que preencher sem uma coleção para criar) e entrega valor de organização assim que o inventário e as estatísticas já existem. Prioridade P3: o app é plenamente utilizável sem ela, mas ela eleva a experiência de gerenciar coleções grandes, no mesmo patamar das estatísticas (US4 do 001).

**Independent Test**: Criar a coleção "Favoritas", renomeá-la para "Top 10" e excluí-la; confirmar que a contagem e o valor do inventário completo permanecem exatamente os mesmos antes, durante e depois.

**Acceptance Scenarios**:

1. **Given** um usuário autenticado sem nenhuma coleção personalizada, **When** ele cria uma coleção com o nome "Favoritas", **Then** a coleção passa a aparecer na sua lista de coleções com contagem "0 cartas · 0 unidades" e valor R$ 0,00.
2. **Given** uma coleção existente "Favoritas", **When** o usuário a renomeia para "Top 10", **Then** o novo nome é exibido e nenhum vínculo de carta é afetado.
3. **Given** uma coleção "Base Set" contendo cartas vinculadas, **When** o usuário exclui a coleção, **Then** a coleção some da lista, mas todas aquelas cartas permanecem no inventário completo com quantidade e valor inalterados.
4. **Given** o campo de nome vazio ou só com espaços, **When** o usuário tenta criar ou renomear uma coleção, **Then** a operação é rejeitada com uma mensagem de nome inválido.

---

### User Story 2 - Adicionar e remover cartas de uma coleção (Priority: P3)

Como colecionador, quero vincular cartas do meu inventário a uma ou mais coleções personalizadas e removê-las quando quiser, sabendo que isso apenas organiza — não duplica nem move a carta no inventário. Uma mesma carta pode estar em nenhuma, uma ou várias coleções ao mesmo tempo.

**Why this priority**: É o que dá utilidade real às coleções criadas em US1; sem vincular cartas, as pastas ficam vazias. P3 pela mesma razão de US1 — melhora a organização sem ser essencial ao funcionamento básico do app.

**Independent Test**: Vincular um mesmo item de inventário (ex.: Charizard Near Mint PT) a duas coleções, confirmar que ele aparece nas duas e continua contando 1× no inventário completo; depois desvinculá-lo de uma coleção e confirmar que ele permanece na outra e no inventário.

**Acceptance Scenarios**:

1. **Given** um item do inventário e uma coleção "Só Charizards", **When** o usuário vincula o item à coleção, **Then** o item passa a aparecer no recorte da coleção sem alterar sua quantidade nem sua presença no inventário completo.
2. **Given** um item já vinculado a "Só Charizards" e a "Favoritas", **When** o inventário completo é consultado, **Then** o item aparece uma única vez (sem duplicação), independentemente de quantas coleções o contêm.
3. **Given** um item vinculado a duas coleções, **When** o usuário o remove de uma delas, **Then** o item deixa de aparecer naquele recorte, mas continua na outra coleção e no inventário completo.
4. **Given** um item já vinculado a uma coleção, **When** o usuário tenta vinculá-lo de novo à mesma coleção, **Then** nada é duplicado (operação idempotente).
5. **Given** uma coleção de outro usuário ou um item que o usuário não possui, **When** ele tenta vincular, **Then** a operação é negada (o recurso é tratado como inexistente para quem não é dono).

---

### User Story 3 - Abrir uma coleção e ver o recorte com estatísticas próprias (Priority: P3)

Como colecionador, quero abrir uma coleção personalizada e ver as cartas daquele recorte — com a mesma busca e apresentação que já uso na listagem do inventário — junto com as estatísticas do recorte: quantidade de cartas e valor total. Essas estatísticas são uma visão local da pasta e não alteram as estatísticas gerais do meu inventário.

**Why this priority**: É onde o valor de organização se materializa para o usuário (ver e avaliar um subconjunto). Depende de US1 e US2. P3 consistente com o restante da feature.

**Independent Test**: Montar uma coleção com itens de preço conhecido, abrir a coleção e conferir que a contagem e o valor total exibidos batem com o cálculo manual de Σ preço × quantidade; em seguida alterar a quantidade de um item no inventário e confirmar que o valor do recorte reflete a mudança, enquanto o dashboard geral permanece coerente com o inventário completo.

**Acceptance Scenarios**:

1. **Given** uma coleção com itens vinculados, **When** o usuário a abre, **Then** ele vê a lista das cartas do recorte com a mesma apresentação (imagem, nome, edição, condição, preço, quantidade) e a mesma busca usadas na listagem do inventário.
2. **Given** uma coleção com itens de preços conhecidos, **When** o usuário visualiza suas estatísticas, **Then** o valor total exibido é a soma de preço atual × quantidade de cada item vinculado, e a contagem exibe tanto o nº de cartas distintas quanto o nº de unidades (soma das quantidades) do recorte.
3. **Given** um item do recorte sem preço disponível, **When** as estatísticas do recorte são calculadas, **Then** esse item é excluído do valor total e sinalizado como "sem preço", da mesma forma que nas estatísticas gerais.
4. **Given** qualquer alteração nas estatísticas de um recorte, **When** o dashboard geral é consultado, **Then** os totais gerais permanecem calculados sobre o inventário completo, sem influência dos recortes.

---

### User Story 4 - Hub de coleções na tela principal (Priority: P4)

Como colecionador, quero uma tela principal que liste minhas coleções personalizadas (com nome, contagem e valor) e ofereça acesso ao inventário completo, para navegar rapidamente entre meus recortes e a visão total.

**Why this priority**: É a camada de navegação/descoberta que amarra US1–US3. Entrega polimento de usabilidade, mas as coleções já são utilizáveis a partir dos fluxos das stories anteriores, por isso P4 (secundária ao núcleo P3).

**Independent Test**: Com três coleções criadas, abrir a tela principal e confirmar que as três aparecem com nome, contagem e valor corretos, mais uma entrada de acesso ao inventário completo; abrir cada uma e o inventário completo a partir dali.

**Acceptance Scenarios**:

1. **Given** um usuário com três coleções personalizadas, **When** ele abre a tela principal de coleções, **Then** as três são listadas com nome, contagem (cartas distintas e unidades) e valor do recorte, além de um acesso ao inventário completo.
2. **Given** a tela principal de coleções, **When** o usuário toca em uma coleção, **Then** ele é levado à visão do recorte daquela coleção (US3).
3. **Given** a tela principal de coleções, **When** o usuário toca no acesso ao inventário completo, **Then** ele é levado à listagem do inventário completo já existente, inalterada.

---

### User Story 5 - Compartilhar uma coleção por link público (Priority: P4)

Como colecionador, quero gerar um link público para uma coleção personalizada específica e enviá-lo a outra pessoa, para mostrar aquele recorte (ex.: "Só Charizards") sem expor meu inventário inteiro. Quero poder controlar o que o link revela e revogá-lo quando quiser.

**Why this priority**: Amplia o valor social/exibição da organização e reutiliza o compartilhamento público já existente (US7 do 001). Não é essencial para organizar (US1–US3), por isso P4, junto ao hub (US4).

**Independent Test**: Ativar o compartilhamento de uma coleção, abrir o link resultante em uma sessão não autenticada e confirmar que só aquele recorte é exibido (respeitando as flags de mostrar cartas/valores/quantidades); depois revogar o link e confirmar que ele deixa de dar acesso.

**Acceptance Scenarios**:

1. **Given** uma coleção personalizada do usuário, **When** ele ativa o compartilhamento público, **Then** o sistema gera um link específico daquela coleção que exibe apenas o recorte correspondente.
2. **Given** um link público de uma coleção, **When** um visitante não autenticado o abre, **Then** ele vê as cartas e as estatísticas daquele recorte conforme as flags de visibilidade (mostrar cartas/valores/quantidades), sem acessar o inventário completo nem outras coleções.
3. **Given** um link público ativo, **When** o dono revoga o compartilhamento, **Then** o link para de conceder acesso e o recorte volta a ser privado.
4. **Given** uma coleção não compartilhada, **When** alguém tenta adivinhar/abrir seu link, **Then** o acesso é negado (a coleção é tratada como inexistente publicamente).

---

### Edge Cases

- **Excluir coleção com cartas**: as cartas permanecem no inventário; somem apenas a coleção e seus vínculos.
- **Excluir coleção compartilhada**: qualquer link público daquela coleção deixa de funcionar imediatamente.
- **Item sem preço em recorte compartilhado com valores visíveis**: tratado como "sem preço" na visão pública, igual à visão privada e às estatísticas gerais.
- **Remover um item do inventário**: seus vínculos em todas as coleções são removidos automaticamente — o item deixa de existir para ser recortado.
- **Merge de quantidade no inventário**: adicionar novamente a mesma carta na mesma condição/idioma/variante incrementa a quantidade do item existente; como o vínculo é por item, a contagem e o valor de todos os recortes que o contêm se atualizam automaticamente.
- **Vincular item já vinculado**: idempotente, sem criar vínculo duplicado.
- **Coleção vazia**: exibida com contagem "0 cartas · 0 unidades" e valor R$ 0,00.
- **Itens sem preço em um recorte**: excluídos do valor total e contados como "sem preço", igual às estatísticas gerais.
- **Nome inválido**: vazio ou só espaços é rejeitado; nome excessivamente longo é limitado.
- **Escopo de posse**: só é possível vincular itens que o usuário possui, e apenas a coleções do próprio usuário; coleções/itens de terceiros são tratados como inexistentes.
- **Coleção com muitas cartas**: a busca e a apresentação do recorte se comportam como a listagem do inventário para volumes grandes.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: O sistema MUST permitir que um usuário autenticado crie uma coleção personalizada nomeada.
- **FR-002**: O sistema MUST exigir um nome não vazio (após remover espaços nas extremidades) para criar ou renomear uma coleção e MUST rejeitar nomes inválidos.
- **FR-003**: Usuários MUST poder renomear uma coleção personalizada existente.
- **FR-004**: Usuários MUST poder excluir uma coleção personalizada; a exclusão MUST remover apenas a coleção e seus vínculos, e MUST NUNCA remover ou alterar itens do inventário.
- **FR-005**: O sistema MUST permitir que um usuário tenha várias coleções personalizadas simultaneamente; nomes de coleção NÃO precisam ser únicos por usuário.
- **FR-006**: Usuários MUST poder vincular um item do próprio inventário a uma coleção personalizada; o vínculo é uma referência ao item, NÃO uma cópia — não duplica nem move o item no inventário.
- **FR-007**: O sistema MUST suportar relação muitos-para-muitos: um item pode estar em nenhuma, uma ou várias coleções ao mesmo tempo.
- **FR-008**: Usuários MUST poder desvincular um item de uma coleção sem afetar o inventário nem os vínculos do item em outras coleções.
- **FR-009**: Vincular um item que já está na coleção MUST ser idempotente (não cria vínculo duplicado).
- **FR-010**: O sistema MUST restringir vínculos a itens que o usuário possui e a coleções de sua propriedade; recursos de outros usuários MUST ser tratados como inexistentes.
- **FR-011**: Quando um item é removido do inventário, o sistema MUST remover automaticamente todos os vínculos desse item em todas as coleções.
- **FR-012**: Cada coleção MUST exibir a contagem do recorte em duas medidas — nº de cartas distintas e nº de unidades (soma das quantidades) — e o valor total do recorte, calculado como a soma de (preço atual × quantidade) dos itens vinculados, usando a mesma seleção de preço atual e o mesmo tratamento de itens com/sem preço aplicados às estatísticas gerais (mesma apresentação de contagem do dashboard da US4).
- **FR-013**: As estatísticas de um recorte MUST NÃO alterar nem alimentar as estatísticas gerais do dashboard, que permanecem calculadas sobre o inventário completo.
- **FR-014**: Ao abrir uma coleção, o sistema MUST listar os itens vinculados com a mesma apresentação e a mesma busca já usadas na listagem do inventário.
- **FR-015**: A tela principal MUST listar as coleções personalizadas do usuário com nome, contagem de cartas e valor do recorte, e MUST oferecer acesso ao inventário completo.
- **FR-016**: O inventário completo MUST permanecer a fonte de verdade e sua estrutura e comportamento MUST permanecer inalterados por esta feature.
- **FR-017**: As wishlists MUST permanecer um conceito separado das coleções personalizadas; nenhum requisito desta feature altera ou se mistura com wishlists.
- **FR-018**: Todos os valores monetários MUST ser representados de forma exata (centavos inteiros), consistentes com a valoração já usada no inventário e nas estatísticas.
- **FR-019**: Usuários MUST poder ativar e revogar o compartilhamento público de uma coleção personalizada específica; ativar gera um link público exclusivo daquela coleção e revogar o invalida imediatamente.
- **FR-020**: A visão pública de uma coleção compartilhada MUST exibir somente o recorte daquela coleção (suas cartas e estatísticas), sem dar acesso ao inventário completo, a outras coleções ou a dados de conta, e MUST respeitar as flags de visibilidade existentes (mostrar cartas / mostrar valores / mostrar quantidades).
- **FR-021**: Uma coleção não compartilhada (ou cujo compartilhamento foi revogado, ou que foi excluída) MUST NÃO ser acessível publicamente por nenhum link.

### Key Entities _(include if feature involves data)_

- **Coleção Personalizada**: um agrupamento nomeado criado por um usuário. Pertence a exatamente um usuário; possui um nome e marcas de criação/atualização; agrega muitos vínculos. Não contém cartas diretamente — apenas referências a itens do inventário. Pode ter um estado de compartilhamento público opcional (ativo/revogado) com um identificador de link exclusivo e as flags de visibilidade (mostrar cartas / valores / quantidades), reutilizando o mesmo conceito do compartilhamento de coleção já existente (US7 do 001).
- **Vínculo de Coleção**: a associação entre uma Coleção Personalizada e um item específico do inventário (a posição carta + condição + idioma + variante, com sua quantidade). Único por par (coleção, item de inventário). É removido automaticamente quando a coleção é excluída **ou** quando o item de inventário é removido. Não carrega quantidade nem preço próprios — esses vêm do item de inventário referenciado.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Um usuário consegue criar uma coleção e vê-la listada imediatamente, em menos de 5 segundos e sem recarregar o app.
- **SC-002**: Uma carta vinculada a N coleções (N ≥ 2) continua sendo contada exatamente 1× no inventário completo — sem qualquer duplicação.
- **SC-003**: Excluir uma coleção deixa a contagem e o valor do inventário completo idênticos aos de antes da exclusão (variação de 0).
- **SC-004**: O valor total exibido por uma coleção é igual à soma de (preço × quantidade) de seus itens vinculados, batendo com o cálculo manual em 100% dos casos verificados.
- **SC-005**: Os totais do dashboard geral permanecem idênticos antes e depois de criar/excluir coleções ou mover cartas entre coleções (as operações de organização têm impacto zero nas estatísticas gerais).
- **SC-006**: Ao abrir uma coleção, o usuário vê as cartas do recorte com o mesmo comportamento de busca da listagem do inventário, encontrando uma carta específica do recorte com a mesma facilidade.
- **SC-007**: Um link público de coleção exibe exatamente o recorte compartilhado (conforme as flags de visibilidade) e, após revogação ou exclusão da coleção, deixa de conceder acesso em 100% das tentativas.

## Assumptions

- **Granularidade do vínculo**: o vínculo é no nível de item de inventário (a posição carta + condição + idioma + variante, com sua quantidade), e não no nível de carta canônica — escolha confirmada com o usuário, por ser a mais fiel a "recorte do inventário" e por reaproveitar diretamente o cálculo de valor existente.
- **Nomes de coleção** não precisam ser únicos por usuário; são armazenados sem espaços nas extremidades e limitados a um comprimento razoável (~60 caracteres).
- **Sem limites práticos** para o número de coleções por usuário ou de cartas por coleção nesta fase.
- **Remoção em cascata**: remover um item do inventário remove os vínculos correspondentes em todas as coleções.
- **Reaproveitamento da apresentação**: o recorte usa a mesma busca e a mesma apresentação de cartas já existentes na listagem do inventário; nenhum novo filtro/ordenação além dos já disponíveis é introduzido nesta fase.
- **Compartilhamento público por coleção (em escopo)**: cada coleção pode ser compartilhada por um link público próprio, reutilizando o mecanismo de compartilhamento e as flags de visibilidade já existentes (US7 do 001). É uma ação explícita do dono (ativar/revogar), não um comportamento automático.
- **Fora de escopo (registrado como futuro)**: comportamentos automáticos das coleções (ex.: uma coleção "à venda" que gera anúncios no marketplace). Nesta fase, além da organização visual, apenas o compartilhamento por link (acima) é suportado — nenhum comportamento automático.
- **Dependências existentes**: reutiliza o inventário (US2 do 001), a valoração/estatísticas (US4 do 001) e a autenticação/perfil já existentes; as wishlists (US9 do 001) permanecem separadas.
