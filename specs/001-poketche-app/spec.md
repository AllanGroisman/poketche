# Feature Specification: PokeTche — App de Coleção e Marketplace de Pokémon TCG

**Feature Branch**: `001-poketche-app`

**Created**: 2026-07-10

**Status**: Draft

**Input**: User description: "Desenvolva o PokeTche (nome provisório), um aplicativo para colecionadores de cartas Pokémon TCG registrarem, avaliarem e negociarem suas coleções. O problema: colecionadores hoje controlam suas coleções em planilhas ou na memória, não sabem quanto sua coleção vale e precisam usar plataformas separadas para vender, além de precisarem registrar uma por uma das cartas. Usuários: colecionadores de cartas Pokémon no Brasil, de casuais a colecionadores sérios. Funcionalidades em ordem de prioridade: registro da coleção com catálogo e autocomplete; precificação automática em reais com referência ao mercado brasileiro; estatísticas da coleção; adição por câmera (scanner contínuo); marketplace com pagamento na plataforma, comissão, envio com rastreio, disputas e reputação. Contas com e-mail/senha ou login social, coleção privada por padrão, dados de vendedor para vender. Fora de escopo: trocas, leilões, outros jogos, desktop."

## Clarifications

### Session 2026-07-10

- Q: Como o scanner deve se comportar com cartas foil, sleeves reflexivos e reflexos de luz (FR-060)? → A: Detecção em melhor esforço — quando o brilho/reflexo impedir identificação confiante, a carta entra na sessão como "a revisar" com as opções prováveis, sem interromper o fluxo; nenhuma garantia de precisão para superfícies reflexivas.
- Q: Quais meios de pagamento o marketplace deve aceitar no MVP? → A: Pix e cartão de crédito.
- Q: Quais provedores de login social o app deve oferecer? → A: Google e Apple (Sign in with Apple é exigido pela App Store quando há login social de terceiros).
- Q: Qual a profundidade da verificação de vendedor (documentos e dados bancários)? → A: Delegada ao provedor de pagamentos — o app coleta o mínimo e encaminha a verificação de identidade e dados bancários ao provedor, que cumpre o KYC regulatório; a plataforma armazena apenas o status da verificação.
- Q: Qual a ordem de grandeza esperada para o primeiro ano? → A: Até ~10 mil usuários, coleções de até ~10 mil cartas e ~1 mil anúncios ativos; dimensionamento sem superengenharia, revisável com tração.

### Session 2026-07-11

- Q: Quem avalia quem após uma venda concluída? → A: Avaliação mútua — comprador e vendedor se avaliam (uma avaliação de cada parte por pedido) e ambos acumulam reputação visível.
- Q: O comprador pode juntar vários anúncios em uma única compra (carrinho)? → A: Carrinho multi-vendedor — o comprador adiciona anúncios de vários vendedores; o checkout gera um pedido por vendedor (pagamento único do total), e cada pedido segue seu fluxo independente de envio/recebimento/liberação/disputa.
- Q: O comprador pode cancelar um pedido pago antes do envio? → A: Sim — cancelamento livre pelo comprador enquanto o pedido está "pago" (não enviado), com reembolso total (itens + frete); após o envio, apenas via disputa.
- Q: Em disputa "item diferente do anunciado" resolvida a favor do comprador, ele devolve a carta? → A: A critério do administrador — a decisão pode condicionar o reembolso à devolução (frete de devolução por conta do vendedor), registrado nas notas da resolução; sem fluxo automatizado de devolução no MVP.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Contas e perfis (Priority: P1)

Um visitante cria uma conta com e-mail e senha ou via login social, acessa o app autenticado e controla a privacidade da sua coleção (privada por padrão, com opção de torná-la pública ou compartilhá-la por link). Ao tornar a coleção visível, o dono controla de forma granular o que é exibido publicamente: lista de cartas (sim/não), valores (sim/não) e quantidade de cada carta (sim/não). Quem deseja vender no marketplace completa o cadastro de vendedor com documentos de identificação e dados bancários para recebimento.

**Why this priority**: nenhuma outra funcionalidade existe sem conta — a coleção pertence a um usuário. É a fundação de todas as demais stories.

**Independent Test**: pode ser testada de ponta a ponta criando uma conta, fazendo login e logout, alternando a visibilidade da coleção (mesmo vazia) e preenchendo o cadastro de vendedor. Entrega valor como controle de identidade e privacidade.

**Acceptance Scenarios**:

1. **Given** um visitante sem conta, **When** ele se cadastra com e-mail e senha válidos, **Then** a conta é criada, o e-mail é verificado e ele acessa o app autenticado.
2. **Given** um visitante sem conta, **When** ele opta por login social, **Then** a conta é criada/vinculada e ele acessa o app autenticado.
3. **Given** um usuário autenticado com coleção, **When** ele não altera nada, **Then** sua coleção permanece privada e invisível a outros usuários.
4. **Given** um usuário autenticado, **When** ele torna a coleção pública ou gera um link de compartilhamento, **Then** qualquer pessoa (inclusive sem conta) consegue visualizar (somente leitura) a coleção, respeitando as configurações de visibilidade do dono.
5. **Given** uma coleção pública, **When** o dono configura a visibilidade (lista de cartas sim/não, valores sim/não, quantidades sim/não), **Then** a visão pública exibe apenas o que foi permitido, imediatamente após a alteração.
6. **Given** um usuário sem cadastro de vendedor completo, **When** ele tenta anunciar uma carta, **Then** o app bloqueia a ação e o direciona para completar documentos e dados bancários.
7. **Given** um usuário que esqueceu a senha, **When** ele solicita recuperação, **Then** recebe um meio seguro de redefini-la.

---

### User Story 2 - Registro manual da coleção (Priority: P1)

Um colecionador adiciona cartas à sua coleção buscando no catálogo oficial de Pokémon TCG por nome com autocomplete, seleciona a carta correta (vendo a imagem oficial, edição/coleção e número da carta) e informa condição (Mint, Near Mint, Excellent, Good, Played, Damaged), quantidade, idioma (português ou inglês) e, opcionalmente, o preço de aquisição (quanto pagou pela carta). Ele visualiza, edita e remove itens da sua coleção.

**Why this priority**: é o coração do produto — resolve diretamente o problema das planilhas. Sem coleção registrada, precificação, estatísticas, scanner e marketplace não têm sobre o que operar.

**Independent Test**: pode ser testada buscando uma carta no catálogo, adicionando-a com condição/quantidade/idioma, conferindo-a na lista da coleção com imagem oficial, editando e removendo. Entrega valor como inventário digital da coleção.

**Acceptance Scenarios**:

1. **Given** um usuário autenticado, **When** ele digita as primeiras letras do nome de uma carta, **Then** o autocomplete sugere cartas do catálogo com nome, edição, número e miniatura da imagem.
2. **Given** uma carta selecionada no catálogo, **When** o usuário informa condição, quantidade e idioma e confirma, **Then** o item aparece na coleção com a imagem oficial e todos os atributos informados.
3. **Given** uma mesma carta em condições ou idiomas diferentes, **When** o usuário adiciona cada variação, **Then** cada combinação (carta + condição + idioma) é registrada como item distinto com sua própria quantidade.
4. **Given** um item da coleção, **When** o usuário edita quantidade, condição ou preço de aquisição, **Then** a alteração é salva e refletida imediatamente.
5. **Given** uma carta sendo adicionada, **When** o usuário informa opcionalmente o preço de aquisição, **Then** o valor é registrado junto ao item para cálculos futuros de ganho/perda; se não informado, o item é adicionado normalmente sem esse dado.
6. **Given** um item da coleção, **When** o usuário o remove, **Then** ele deixa de aparecer na coleção após confirmação.
7. **Given** uma busca sem resultados no catálogo, **When** o usuário termina de digitar, **Then** o app informa claramente que a carta não foi encontrada e orienta a revisar a grafia ou os filtros.

---

### User Story 3 - Precificação automática (Priority: P2)

Cada carta da coleção exibe seu preço de mercado atual em reais (BRL), com referência ao mercado brasileiro, considerando condição e idioma quando disponível. Os preços são atualizados periodicamente e o usuário vê a data/hora da última atualização de cada cotação.

**Why this priority**: responde à pergunta central do colecionador ("quanto vale?"). Depende da coleção existir (US2), mas é o que transforma o inventário em avaliação.

**Independent Test**: pode ser testada adicionando cartas conhecidas à coleção e verificando que cada uma exibe preço em BRL e a data da última atualização; simulando indisponibilidade da fonte de preços, o app continua funcional exibindo a última cotação conhecida.

**Acceptance Scenarios**:

1. **Given** uma carta na coleção com cotação disponível, **When** o usuário visualiza o item, **Then** vê o preço de mercado em reais e a data da última atualização.
2. **Given** cotações desatualizadas além do período de atualização definido, **When** o ciclo periódico de atualização executa, **Then** os preços são renovados e a data de atualização reflete o novo momento.
3. **Given** uma carta sem cotação disponível na fonte, **When** o usuário visualiza o item, **Then** o app indica "preço indisponível" sem impedir o uso do restante da coleção.
4. **Given** a fonte externa de preços fora do ar, **When** o app tenta atualizar, **Then** as últimas cotações conhecidas continuam exibidas com sua data original e nenhuma funcionalidade do app é bloqueada.

---

### User Story 8 - Estatísticas e histórico de valor por carta (Priority: P3)

O colecionador abre a tela de detalhes de qualquer carta da sua coleção e vê: o preço de mercado atual, um gráfico com o histórico de preço ao longo do tempo, a variação percentual em períodos (7 dias, 30 dias, 90 dias e desde a adição à coleção) e o maior/menor preço registrado no período disponível. Os valores consideram a condição e a quantidade informadas: valor unitário pela condição da carta e valor total da posição (preço × quantidade). Se o usuário informou o preço de aquisição, vê também o ganho/perda em reais e em percentual desde a compra; caso contrário, a variação desde a data em que adicionou a carta. Na listagem da coleção, indicadores visuais sinalizam cartas em valorização ou desvalorização recente.

**Why this priority**: aprofunda a proposta de valor da precificação ("quanto vale?" vira "está valorizando? valeu a pena?"). Depende diretamente da precificação (US3), que gera os snapshots de preço, e da coleção (US2); alimenta os rankings do dashboard (US4). Mesma faixa de prioridade do dashboard, logo após a precificação.

**Independent Test**: pode ser testada com cartas na coleção e alguns ciclos de atualização de preço acumulados: abrir os detalhes de uma carta e conferir gráfico, variações por período, maior/menor preço, valor unitário e da posição; adicionar uma carta com preço de aquisição e conferir o ganho/perda; conferir os indicadores de tendência na listagem.

**Acceptance Scenarios**:

1. **Given** uma carta da coleção com histórico de cotações, **When** o usuário abre seus detalhes, **Then** vê o preço atual, o gráfico do histórico de preço, a variação percentual em 7, 30 e 90 dias e desde a adição à coleção, e o maior/menor preço do período disponível.
2. **Given** um item com condição e quantidade informadas, **When** o usuário vê os valores do item, **Then** vê o valor unitário correspondente à condição da carta e o valor total da posição (preço × quantidade).
3. **Given** um item com preço de aquisição informado, **When** o usuário abre seus detalhes, **Then** vê o ganho ou perda em reais e em percentual desde a compra.
4. **Given** um item sem preço de aquisição informado, **When** o usuário abre seus detalhes, **Then** vê a variação de valor desde a data em que a carta foi adicionada à coleção.
5. **Given** a listagem da coleção, **When** cartas tiveram valorização ou desvalorização recente, **Then** um indicador visual de tendência (alta/baixa) aparece junto a cada carta afetada.
6. **Given** uma carta recém-adicionada ao catálogo, sem histórico de preço suficiente, **When** o usuário abre seus detalhes, **Then** o app exibe "histórico indisponível" no lugar do gráfico (nunca um gráfico vazio) e mostra apenas as variações calculáveis.
7. **Given** uma carta com histórico menor que um dos períodos (ex.: 10 dias de dados), **When** o usuário vê as variações, **Then** os períodos sem dados suficientes (30/90 dias) são indicados como indisponíveis, sem valores enganosos.

---

### User Story 4 - Estatísticas da coleção (Priority: P3)

O colecionador acessa um dashboard com: valor total estimado da coleção, evolução desse valor ao longo do tempo, distribuição por edição/raridade/tipo, ranking das cartas mais valiosas, progresso de completude por edição (quantas cartas da edição X ele tem vs. o total da edição) e rankings derivados dos dados por carta: maiores valorizações e desvalorizações do período e cartas com maior ganho/perda em relação ao preço de aquisição.

**Why this priority**: agrega valor analítico sobre os dados já existentes (US2 + US3 + US8). É diferencial de engajamento, mas o app funciona sem ele.

**Independent Test**: pode ser testada com uma coleção precificada, conferindo que o valor total corresponde à soma dos itens (preço × quantidade), que os gráficos de distribuição batem com os dados e que a completude por edição reflete a contagem correta.

**Acceptance Scenarios**:

1. **Given** uma coleção com cartas precificadas, **When** o usuário abre o dashboard, **Then** vê o valor total estimado igual à soma de (preço × quantidade) dos itens com cotação.
2. **Given** o passar do tempo com atualizações de preço, **When** o usuário consulta a evolução, **Then** vê um histórico do valor total da coleção ao longo do tempo.
3. **Given** uma coleção variada, **When** o usuário abre as distribuições, **Then** vê a composição por edição, por raridade e por tipo.
4. **Given** uma coleção precificada, **When** o usuário consulta as cartas mais valiosas, **Then** vê o ranking ordenado por valor.
5. **Given** cartas de uma edição na coleção, **When** o usuário abre a completude, **Then** vê "N de M cartas" da edição com percentual de progresso.
6. **Given** itens sem cotação, **When** o dashboard calcula o valor total, **Then** esses itens são indicados como não incluídos na estimativa.
7. **Given** cartas com histórico de preço, **When** o usuário consulta os rankings de variação, **Then** vê as maiores valorizações e desvalorizações do período selecionado.
8. **Given** cartas com preço de aquisição informado, **When** o usuário consulta o ranking de ganho/perda, **Then** vê as cartas ordenadas pelo maior ganho e pela maior perda em relação ao que pagou; cartas sem preço de aquisição não entram nesse ranking.

---

### User Story 5 - Adição por câmera com sessões de escaneamento (Priority: P4)

O usuário inicia uma **sessão de escaneamento** que abre a câmera em modo contínuo. Ao detectar cartas no enquadramento, o app desenha molduras em tempo real ao redor de cada carta, acompanhando sua posição na tela — múltiplas cartas visíveis recebem molduras individuais. Quando uma carta é identificada com confiança suficiente, ela é adicionada automaticamente à **sessão** (ainda não à coleção), com a moldura mudando de estado para "capturada" e um contador visível de cartas da sessão. Cartas já capturadas e reapresentadas são tratadas como duplicatas (incremento de quantidade, sem registro repetido). O app também identifica automaticamente o idioma da carta (português ou inglês nesta fase), registrando-o na captura sem o usuário precisar informar; quando o idioma não é determinável com confiança, inglês é assumido como padrão, ajustável na revisão. Identificações ambíguas entram na sessão como "a revisar", sem interromper o escaneamento. Cada captura dispara feedback visual e sonoro — padrão para cartas comuns e especial (celebratório) para cartas de raridade alta, acima de um valor configurável ou presentes em wishlists do usuário. Ao encerrar, uma tela de revisão permite corrigir, resolver pendências, ajustar atributos, excluir e complementar manualmente, com resumo estatístico da sessão; só após a confirmação as cartas entram na coleção. Sessões interrompidas são recuperáveis. Durante a sessão, o usuário pode alternar entre a câmera traseira (padrão) e a frontal por um botão visível, com a preferência lembrada. Opcionalmente, pode gravar a sessão (toggle desligado por padrão): o vídeo captura o que ele vê na tela — câmera com molduras, animações e contadores sobrepostos, incluindo o áudio dos feedbacks — e, na revisão, pode ser assistido, salvo na galeria, compartilhado via compartilhamento nativo do sistema ou descartado; os vídeos ficam apenas no dispositivo.

**Why this priority**: é o diferencial competitivo (elimina o registro um a um), mas por decisão explícita o app deve ser plenamente utilizável sem ele — o registro manual (US2) é o caminho alternativo garantido. Integra-se às wishlists (US9) para o feedback especial e à coleção (US2) como destino final.

**Independent Test**: pode ser testada iniciando uma sessão sobre um lote de cartas físicas conhecidas (incluindo duplicatas, uma carta rara e uma carta de wishlist), verificando molduras, capturas automáticas, contador, feedbacks diferenciados, tela de revisão com resumo estatístico e a inclusão na coleção só após confirmação; alternando entre câmeras traseira e frontal durante a sessão; gravando uma sessão e verificando reprodução, salvamento na galeria, compartilhamento nativo e descarte do vídeo sem afetar as cartas; interrompendo o app no meio, a sessão é recuperável; negando a permissão de câmera, o app continua funcionando com o fluxo manual.

**Acceptance Scenarios**:

_Sessão e detecção contínua_

1. **Given** um usuário na coleção, **When** ele inicia uma sessão de escaneamento, **Then** a câmera abre em modo contínuo e cartas detectadas no enquadramento recebem molduras em tempo real que acompanham sua posição.
2. **Given** múltiplas cartas visíveis simultaneamente, **When** o app as detecta, **Then** cada carta recebe uma moldura individual.
3. **Given** uma carta identificada com confiança suficiente, **When** a identificação ocorre, **Then** a carta é adicionada automaticamente à sessão (não à coleção), a moldura muda para o estado "capturada" e o contador visível da sessão é incrementado.
4. **Given** uma carta já capturada na sessão, **When** ela é reapresentada à câmera, **Then** o app a reconhece como duplicata e incrementa a quantidade daquela captura, com indicação visual, sem criar registro repetido.
5. **Given** uma identificação ambígua, **When** o app não tem confiança suficiente, **Then** a carta entra na sessão marcada como "a revisar" com as opções mais prováveis salvas para escolha posterior, sem interromper o escaneamento.

_Identificação automática de idioma_

6. **Given** uma carta em português ou em inglês capturada, **When** o app determina o idioma com confiança, **Then** a captura entra na sessão com o idioma registrado automaticamente, sem o usuário informar, e a imagem exibida corresponde ao idioma da carta quando disponível.
7. **Given** uma carta cujo idioma não pôde ser determinado com confiança, **When** ela é capturada, **Then** entra na sessão com inglês como idioma padrão, ajustável na tela de revisão.

_Feedback por captura_

8. **Given** a captura de uma carta comum, **When** ela é registrada na sessão, **Then** um feedback visual (animação na moldura) e sonoro padrão é disparado.
9. **Given** a captura de uma carta de raridade alta ou com valor de mercado acima do limiar configurado, **When** ela é registrada, **Then** o feedback é o especial (som e animação distintos, celebratórios).
10. **Given** a captura de uma carta presente em wishlist do usuário, **When** ela é registrada, **Then** o feedback especial é disparado e o app indica qual wishlist e se o preço atual está no alvo.
11. **Given** sons desativados nas configurações, **When** capturas ocorrem, **Then** nenhum som é emitido, o feedback visual permanece e o ritmo de detecção contínua não é afetado.

_Revisão e confirmação_

12. **Given** o encerramento da sessão, **When** a tela de revisão abre, **Then** o usuário pode corrigir identificações, resolver as cartas "a revisar" escolhendo entre as opções, ajustar quantidade, condição e idioma de cada captura, excluir capturas erradas e adicionar manualmente cartas que a câmera não pegou.
13. **Given** a tela de revisão, **When** o usuário consulta o resumo da sessão, **Then** vê: total de cartas, valor de mercado total estimado, distribuição por raridade e por edição, carta mais valiosa da sessão e quantas cartas estavam em wishlists.
14. **Given** a revisão concluída, **When** o usuário confirma, **Then** as cartas são adicionadas à coleção (disparando, quando aplicável, a pergunta de remoção de wishlist) — e nada é adicionado antes dessa confirmação.
15. **Given** uma sessão em revisão, **When** o usuário escolhe descartá-la, **Then** a sessão inteira é descartada sem alterar a coleção, após confirmação.
16. **Given** uma sessão interrompida (app fechado, ligação recebida), **When** o usuário reabre o app, **Then** ele pode retomar a sessão pendente do ponto em que parou ou descartá-la.

_Escolha de câmera_

17. **Given** uma sessão de escaneamento ativa, **When** o usuário toca o botão de alternância de câmera visível na interface, **Then** a detecção passa da câmera traseira (padrão) para a frontal (ou vice-versa), com molduras, capturas e feedbacks funcionando da mesma forma em ambas.
18. **Given** um usuário que alternou a câmera em uma sessão, **When** ele inicia a próxima sessão, **Then** a câmera escolhida anteriormente é lembrada como preferência.

_Gravação e compartilhamento da sessão_

19. **Given** o início de uma sessão, **When** o usuário ativa o toggle de gravação (visível e desligado por padrão), **Then** a sessão é gravada capturando o que ele vê na tela: o vídeo da câmera com as molduras de detecção, animações e contadores sobrepostos, incluindo o áudio dos feedbacks sonoros.
20. **Given** um aparelho sem capacidade de gravar e detectar simultaneamente, **When** o usuário tenta ativar a gravação, **Then** o app informa a limitação e desativa a gravação, mantendo o escaneamento funcionando normalmente — a gravação nunca degrada perceptivelmente a detecção em tempo real.
21. **Given** uma sessão gravada encerrada, **When** o usuário está na tela de revisão, **Then** ele pode assistir ao vídeo e escolher entre salvar na galeria do celular, compartilhar via compartilhamento nativo do sistema ou descartar o vídeo — e descartar o vídeo não descarta as cartas da sessão.
22. **Given** uma gravação finalizada, **When** o usuário opta pelo encerramento visual, **Then** o vídeo ganha como última cena um resumo da sessão (total de cartas, valor estimado, carta mais rara/valiosa), tornando-o autocontido para compartilhamento.
23. **Given** qualquer sessão gravada, **When** o vídeo é criado, **Then** ele permanece apenas no dispositivo do usuário — nenhum vídeo é enviado aos servidores da plataforma.

_Caminho alternativo_

24. **Given** permissão de câmera negada ou indisponível, **When** o usuário tenta abrir o scanner, **Then** o app explica a necessidade da permissão e todos os demais fluxos (incluindo registro manual completo) permanecem funcionando.

---

### User Story 6 - Marketplace com pagamento e comissão (Priority: P5)

Um vendedor com cadastro completo anuncia cartas da sua coleção definindo preço, condição e frete (valor fixo ou incluso no preço). Compradores navegam, buscam e filtram anúncios e compram dentro do app por um carrinho que aceita anúncios de vários vendedores (o checkout gera um pedido por vendedor, com pagamento único), informando o endereço de entrega (com opção de reutilizar endereços salvos no perfil) e vendo o total — itens + frete por vendedor — antes de confirmar. O pagamento é processado na plataforma e retido em custódia; o vendedor confirma o envio informando a transportadora e o código de rastreio; o comprador confirma o recebimento; o valor é então liberado ao vendedor menos a comissão percentual da plataforma (que incide apenas sobre o valor do item — o frete é repassado integralmente). Há mecanismo de disputa quando a carta não chega ou vem diferente do anunciado, e vendedores acumulam reputação por avaliações.

**Why this priority**: é o modelo de receita e a funcionalidade mais complexa; depende de contas (US1), coleção (US2) e se beneficia de preços (US3) como referência. Envolve dinheiro — sujeita às regras mais rígidas de validação e auditoria da constituição do projeto.

**Independent Test**: pode ser testada de ponta a ponta com dois usuários: vendedor anuncia (com frete), comprador compra informando endereço e paga o total, vendedor confirma envio com transportadora e rastreio, comprador confirma recebimento, valor liberado (item menos comissão + frete), avaliação registrada. Fluxo de disputa testado com um pedido não confirmado.

**Acceptance Scenarios**:

1. **Given** um vendedor com cadastro completo e um item na coleção, **When** ele cria um anúncio com preço, condição e frete (valor fixo ou frete incluso no preço), **Then** o anúncio fica visível e buscável no marketplace, com o frete indicado.
2. **Given** um comprador navegando, **When** ele busca e filtra (por nome, edição, condição, idioma, faixa de preço), **Then** vê apenas anúncios ativos compatíveis com os filtros.
3. **Given** um anúncio aberto, **When** o comprador (ou visitante) visualiza seus detalhes, **Then** vê também o histórico de preços de mercado da carta, permitindo avaliar se o preço pedido está justo; se não houver histórico suficiente, a indicação "histórico indisponível" é exibida.
4. **Given** anúncios ativos de um ou mais vendedores, **When** o comprador os adiciona ao carrinho e inicia o checkout, **Then** informa o endereço de entrega (podendo selecionar um endereço salvo no perfil ou cadastrar um novo, com opção de salvá-lo para reuso) e vê o total da compra — itens + frete por vendedor — com a indicação de que será gerado um pedido (e um envio) por vendedor, antes de confirmar o pagamento.
5. **Given** um checkout confirmado, **When** o pagamento único é aprovado, **Then** o valor total fica retido pela plataforma, um pedido é criado por vendedor (cada um com seus itens, frete e endereço congelados), as unidades saem de circulação e cada vendedor passa a ver o endereço de entrega do seu pedido; a partir daí cada pedido segue fluxo independente de envio, recebimento, liberação e disputa.
6. **Given** um pagamento recusado ou falho, **When** a transação não é aprovada, **Then** nenhum valor é retido, o anúncio permanece ativo e o comprador é informado do motivo com opção de tentar novamente.
7. **Given** um pedido pago, **When** o vendedor confirma o envio informando a transportadora (Correios, Jadlog, Loggi ou outra) e o código de rastreio — ambos obrigatórios —, **Then** o pedido muda para "enviado" e o comprador vê a transportadora, o código e um link de rastreamento.
8. **Given** um pedido enviado, **When** o comprador confirma o recebimento, **Then** o valor é liberado ao vendedor — itens do pedido menos a comissão percentual, mais o frete integral — e ambos podem se avaliar.
9. **Given** um pedido enviado sem confirmação do comprador e sem disputa aberta, **When** o prazo de liberação automática contado a partir da data de postagem expira, **Then** o valor é liberado automaticamente ao vendedor.
10. **Given** um pedido com problema (não chegou dentro do prazo ou item diferente do anunciado), **When** o comprador abre uma disputa dentro do prazo de liberação, **Then** a liberação do valor é suspensa até a resolução, com espaço para ambas as partes apresentarem evidências.
11. **Given** uma disputa resolvida a favor do comprador, **When** a decisão é registrada, **Then** o comprador é reembolsado integralmente (item + frete) e o vendedor não recebe o valor.
12. **Given** uma venda concluída, **When** comprador e vendedor se avaliam (uma avaliação de cada parte por pedido), **Then** a avaliação do vendedor compõe sua reputação pública exibida nos anúncios e perfil, e a do comprador compõe a reputação exibida em seu perfil.
13. **Given** qualquer movimentação financeira (pagamento, retenção, liberação, reembolso, comissão), **When** ela ocorre, **Then** fica registrada em trilha de auditoria com data, valores, partes e estado anterior/posterior.

---

### User Story 7 - Acesso de visitante não autenticado (Priority: P3)

Qualquer pessoa, sem cadastro, acessa uma coleção marcada como pública através de um link compartilhável e visualiza o que o dono permitiu: cartas com imagens, estatísticas básicas da coleção e, apenas se o dono autorizar, os valores (incluindo o valor total). Visitantes também navegam e buscam anúncios do marketplace e exploram o catálogo completo de cartas (US10) sem conta; ao tentar comprar, vender ou criar a própria coleção, o app os conduz ao cadastro.

**Why this priority**: amplia o alcance do produto (compartilhamento vira canal de aquisição de usuários) e reduz a barreira de entrada no marketplace. Depende da existência de coleções compartilháveis (US1/US2); a parte de navegação em anúncios se aplica quando o marketplace (US6) existir, mas a visão pública de coleções é testável antes disso.

**Independent Test**: pode ser testada abrindo o link de uma coleção pública em um dispositivo sem sessão autenticada e verificando que a visão respeita as configurações de visibilidade do dono; e tentando executar uma ação restrita (comprar/vender/criar coleção) e confirmando o direcionamento ao cadastro.

**Acceptance Scenarios**:

1. **Given** uma coleção pública com link compartilhável, **When** um visitante sem conta abre o link, **Then** vê as cartas com imagens e as estatísticas básicas da coleção, em modo somente leitura.
2. **Given** uma coleção pública cujo dono não permitiu exibição de valores, **When** um visitante a acessa, **Then** nenhum valor (individual ou total) é exibido.
3. **Given** uma coleção pública cujo dono permitiu exibição de valores, **When** um visitante a acessa, **Then** o valor total estimado e os valores permitidos são exibidos.
4. **Given** uma coleção pública cujo dono ocultou as quantidades, **When** um visitante a acessa, **Then** as cartas aparecem sem indicação de quantas cópias o dono possui.
5. **Given** uma coleção privada (ou que voltou a ser privada), **When** alguém tenta acessá-la por link antigo, **Then** o acesso é negado com mensagem clara, sem revelar conteúdo.
6. **Given** um visitante sem conta no marketplace, **When** ele navega, busca e filtra anúncios, **Then** vê os anúncios ativos normalmente, sem precisar de cadastro.
7. **Given** um visitante sem conta, **When** ele tenta comprar um anúncio, vender uma carta, criar uma coleção ou criar uma wishlist, **Then** o app o conduz ao fluxo de cadastro/login e, após concluí-lo, o retorna ao ponto em que estava.

---

### User Story 9 - Wishlists (listas de desejo) com preço-alvo (Priority: P4)

O colecionador cria uma ou mais wishlists nomeadas (ex.: "Completar Base Set", "Cartas do meu deck") e adiciona cartas do catálogo usando o mesmo autocomplete do registro de coleção. Para cada carta, pode definir opcionalmente um preço-alvo — o valor pelo qual gostaria de comprá-la. Quando o preço de mercado atinge ou fica abaixo do alvo, ele recebe uma notificação push (controlável por wishlist e globalmente, sem repetições indevidas). Na tela da wishlist, cada carta exibe preço atual, preço-alvo, diferença e indicador de "atingiu o alvo"; anúncios ativos do marketplace com preço igual ou abaixo do alvo são destacados com atalho direto. Cartas que o usuário já possui na coleção são sinalizadas, e ao adquirir uma carta que está em wishlist o app pergunta se deve removê-la (com opção de remoção automática configurável).

**Why this priority**: transforma o app de inventário passivo em ferramenta ativa de compra, gera recorrência de uso e alimenta o marketplace com demanda qualificada. Depende do catálogo (US2) e da precificação com snapshots (US3/US8) para os alvos; a integração com anúncios se aplica quando o marketplace (US6) existir. Não bloqueia nenhuma outra story — mesma faixa do scanner (P4), antes do marketplace.

**Independent Test**: pode ser testada criando uma wishlist, adicionando cartas com preço-alvo e simulando atualizações de cotação: verificar indicador de alvo atingido, recebimento de uma única notificação (sem repetição até rearmar), controles de ativação por wishlist e global, sinalização de cartas já possuídas e a pergunta de remoção ao registrar uma carta da wishlist na coleção.

**Acceptance Scenarios**:

1. **Given** um usuário autenticado, **When** ele cria wishlists nomeadas e adiciona cartas buscando no catálogo com autocomplete, **Then** as wishlists aparecem com suas cartas, imagens oficiais e preços atuais.
2. **Given** uma carta na wishlist, **When** o usuário define um preço-alvo opcional, **Then** a tela passa a exibir preço atual, preço-alvo, diferença entre eles e o indicador visual de "atingiu o alvo" quando aplicável.
3. **Given** uma carta com preço-alvo e notificações ativas, **When** uma atualização de cotação leva o preço de mercado a valor igual ou abaixo do alvo, **Then** o usuário recebe uma notificação push informando a carta e o preço.
4. **Given** uma carta que já gerou notificação de alvo atingido, **When** o preço permanece abaixo do alvo nas atualizações seguintes, **Then** nenhuma nova notificação é enviada — por mais tempo que isso dure. O app só volta a notificar se o preço subir acima do alvo e cair novamente (rearme); e, se esse rearme acontecer antes de decorrido o intervalo mínimo desde a última notificação, a notificação também é suprimida.
5. **Given** as configurações de notificação, **When** o usuário desativa notificações de uma wishlist específica ou globalmente, **Then** nenhuma notificação daquela wishlist (ou de nenhuma, no caso global) é enviada, sem afetar os indicadores visuais nas telas.
6. **Given** uma carta da wishlist com anúncios ativos no marketplace a preço igual ou abaixo do alvo, **When** o usuário vê a wishlist ou recebe a notificação, **Then** o app destaca a existência desses anúncios com atalho direto para eles.
7. **Given** uma carta da wishlist que o usuário já possui na coleção, **When** ele visualiza a wishlist, **Then** a carta aparece sinalizada como "já na coleção".
8. **Given** o registro de uma carta na coleção por qualquer método (manual, scanner ou compra no marketplace), **When** a carta está em uma ou mais wishlists, **Then** o app pergunta se deve removê-la das wishlists — ou a remove automaticamente, se o usuário ativou essa opção.
9. **Given** uma carta da wishlist sem cotação disponível, **When** o usuário a visualiza, **Then** o app indica "preço indisponível" e nenhuma notificação de alvo é gerada para ela.

---

### User Story 10 - Explorador de Catálogo (Priority: P3)

Qualquer pessoa — incluindo visitantes não autenticados — navega pelo catálogo completo de cartas Pokémon TCG do sistema: a lista de todas as edições/coleções (com logo, data de lançamento e total de cartas) e, ao abrir uma edição, a grade de todas as suas cartas com imagens. Uma busca global encontra cartas por nome em qualquer idioma suportado, com filtros por edição, raridade, tipo e faixa de preço. A tela de detalhe da carta é acessível a partir do catálogo mesmo sem possuí-la: imagem em alta resolução, dados da carta, preço de mercado atual com fonte e data, e histórico de preço. Para usuários autenticados, o detalhe indica se/quantas ele possui e oferece ações rápidas (adicionar à coleção, adicionar a uma wishlist, ver anúncios ativos no marketplace), e o progresso de completude por edição se torna navegável: dentro da edição, o usuário vê quais cartas possui e quais faltam, com atalho para adicionar as faltantes a uma wishlist.

**Why this priority**: é leitura sobre dados que o sistema já mantém (catálogo sincronizado + cotações) e transforma o app em ferramenta de descoberta — porta de entrada para visitantes (aquisição) e gerador de demanda para wishlists (US9) e marketplace (US6). Depende do catálogo (base da US2) e da precificação (US3); não bloqueia nenhuma outra story.

**Independent Test**: pode ser testada sem conta, navegando da lista de edições à grade de cartas e ao detalhe com preço e histórico; e com conta, verificando indicadores de posse, ações rápidas e a visão de completude da edição com atalho para wishlist.

**Acceptance Scenarios**:

1. **Given** qualquer pessoa (autenticada ou não), **When** ela abre o explorador de catálogo, **Then** vê a lista de todas as edições com logo, data de lançamento e total de cartas.
2. **Given** uma edição aberta, **When** a grade carrega, **Then** todas as cartas da edição aparecem com imagens (no idioma do usuário quando disponível, fallback em inglês).
3. **Given** a busca global do catálogo, **When** o usuário busca por nome em português ou inglês e aplica filtros (edição, raridade, tipo, faixa de preço), **Then** vê apenas cartas compatíveis; com filtro de preço ativo, cartas sem cotação ficam de fora com indicação clara.
4. **Given** uma carta aberta a partir do catálogo, **When** a tela de detalhe carrega, **Then** exibe imagem em alta resolução, dados da carta, preço de mercado atual com fonte e data, e histórico de preço — mesmo que o usuário não a possua.
5. **Given** um usuário autenticado no detalhe de uma carta, **When** ele a visualiza, **Then** vê se e quantas cópias possui na coleção e as ações rápidas: adicionar à coleção, adicionar a uma wishlist e ver anúncios ativos dela no marketplace.
6. **Given** um usuário autenticado dentro de uma edição, **When** ele abre a visão de completude, **Then** vê quais cartas daquela edição possui e quais faltam, com atalho para adicionar as faltantes a uma wishlist.
7. **Given** um visitante não autenticado no catálogo, **When** ele tenta uma ação que exige conta (adicionar à coleção, adicionar a wishlist, comprar), **Then** é conduzido ao cadastro/login e retorna ao ponto de origem após autenticar.
8. **Given** um visitante não autenticado numa edição, **When** ele visualiza a grade, **Then** nenhum indicador de posse ou completude é exibido (dados de coleção exigem conta).

---

### User Story 11 - Administração de disputas do marketplace (Priority: P5)

Um administrador da plataforma (membro da equipe interna, com papel restrito) acessa a fila de disputas abertas do marketplace. Para cada disputa, visualiza os detalhes do pedido (itens, valores, estados, prazos, histórico) e as evidências enviadas por comprador e vendedor. Antes de decidir, pode solicitar informações adicionais às partes, que são notificadas e têm um prazo para responder. A decisão tem dois desfechos possíveis — reembolsar integralmente o comprador (item + frete) ou liberar o pagamento ao vendedor (item menos comissão, mais frete) — e fica registrada em trilha de auditoria com o administrador responsável. Administradores não podem operar disputas de pedidos em que sejam parte (comprador ou vendedor). A operação trabalha com prazos-alvo de primeira resposta e de resolução.

**Why this priority**: é a contraparte operacional obrigatória do mecanismo de disputas da US6 (FR-032) — sem ela, disputas suspendem valores indefinidamente. Mesma prioridade do marketplace, do qual depende integralmente; deve estar disponível junto com a US6.

**Independent Test**: pode ser testada com um pedido em disputa e um usuário com papel de administrador: percorrer a fila, abrir os detalhes e evidências, solicitar informação adicional a uma parte, registrar cada desfecho (reembolso e liberação) e conferir a auditoria; verificar que um administrador que é parte do pedido é impedido de operá-lo e que usuários sem o papel não acessam a área.

**Acceptance Scenarios**:

1. **Given** disputas abertas no marketplace, **When** um administrador acessa a área de administração, **Then** vê a fila de disputas abertas ordenada por data de abertura, com identificação do pedido, motivo e tempo decorrido.
2. **Given** uma disputa na fila, **When** o administrador a abre, **Then** vê os detalhes do pedido (carta, valores de item/frete/comissão, estados e prazos) e todas as evidências enviadas por comprador e vendedor.
3. **Given** uma disputa em análise, **When** o administrador solicita informações adicionais a uma ou ambas as partes, **Then** as partes são notificadas com o que foi pedido e o prazo de resposta, e a disputa fica marcada como aguardando as partes.
4. **Given** uma solicitação de informações sem resposta, **When** o prazo de resposta expira, **Then** o administrador pode decidir com base nas evidências disponíveis.
5. **Given** uma disputa analisada, **When** o administrador decide pelo reembolso, **Then** o comprador é reembolsado integralmente (item + frete), o vendedor não recebe o valor, as partes são notificadas e a decisão fica em auditoria com o administrador responsável.
6. **Given** uma disputa analisada, **When** o administrador decide pela liberação, **Then** o vendedor recebe o valor (item menos comissão, mais frete), as partes são notificadas e a decisão fica em auditoria com o administrador responsável.
7. **Given** uma disputa de um pedido em que o administrador é comprador ou vendedor, **When** ele tenta visualizá-la ou decidi-la, **Then** o sistema o impede, e a disputa só pode ser operada por outro administrador.
8. **Given** um usuário sem o papel de administrador, **When** ele tenta acessar a área de administração, **Then** o acesso é negado.

---

### Edge Cases

- Fonte externa de preços fora do ar ou com formato alterado: últimas cotações conhecidas permanecem exibidas com data original; nenhum fluxo é bloqueado.
- Carta sem cotação no mercado brasileiro: item marcado como "preço indisponível" e excluído do valor total com indicação clara.
- Carta recém-adicionada ao catálogo, sem snapshots de preço suficientes: tela de detalhes exibe "histórico indisponível" em vez de gráfico vazio; variações e maior/menor preço aparecem apenas para os períodos com dados.
- Usuário edita condição ou quantidade de um item: valor unitário e valor da posição são recalculados imediatamente; o preço de aquisição informado permanece inalterado.
- Preço de aquisição informado com valor implausível (zero ou negativo): entrada rejeitada com mensagem clara; o campo permanece opcional.
- Lacunas no histórico (períodos sem snapshot por indisponibilidade da fonte): gráfico e variações usam os dados existentes, sem interpolar valores fictícios.
- Scanner em ambiente escuro, carta em sleeve reflexivo, carta foil com brilho intenso ou carta falsificada: identificação ambígua entra na sessão como "a revisar" para resolução na tela de revisão, sem interromper o escaneamento.
- Permissão de câmera negada: scanner indisponível com explicação; registro manual permanece completo.
- Cartas parcialmente sobrepostas em pilha: apenas cartas suficientemente visíveis são detectadas; as demais podem ser adicionadas manualmente na revisão.
- Carta em idioma não suportado (ex.: japonês) capturada pelo scanner: identificação segue em melhor esforço e o idioma registrado é inglês (padrão), ajustável na revisão apenas entre os idiomas suportados (PT/EN).
- Carta em português sem imagem PT disponível na fonte: a imagem em inglês é exibida como fallback, sem indicação de erro.
- Edição sem logo ou sem data de lançamento na fonte de catálogo: a lista exibe a edição com placeholder/sem o dado ausente, sem quebrar a navegação.
- Edição muito grande (200+ cartas) no explorador: a grade carrega progressivamente com estados de loading, sem travar a navegação.
- Busca global com filtro de faixa de preço e todas as cartas sem cotação: resultado vazio com explicação (cartas sem cotação não entram no filtro de preço), não uma tela vazia genérica.
- Sessão pendente encontrada ao abrir o app: usuário escolhe retomar ou descartar antes de iniciar nova sessão; nenhuma carta da sessão pendente consta na coleção.
- Cotações indisponíveis durante a sessão: capturas e revisão funcionam normalmente; o resumo estatístico usa as últimas cotações conhecidas e indica itens sem preço.
- Mesma carta capturada em duplicidade por erro de identificação (registros distintos): o usuário exclui ou mescla ajustando quantidades na tela de revisão.
- Armazenamento do aparelho esgota durante a gravação: a gravação é interrompida com aviso claro; a sessão de escaneamento continua normalmente e as capturas são preservadas.
- Sessão gravada é interrompida (app fechado, ligação): ao retomar a sessão, o vídeo parcial já gravado fica disponível na revisão; a gravação não é retomada automaticamente.
- Permissão de acesso à galeria negada ao salvar o vídeo: o app explica e mantém as opções de compartilhar ou descartar.
- Sons de feedback desativados nas configurações durante uma sessão gravada: o vídeo é gravado sem o áudio dos feedbacks, refletindo o que o usuário experimentou.
- Usuário anuncia mais cópias do que possui na coleção ou remove da coleção um item anunciado: o app impede quantidade anunciada maior que a possuída e alerta/desativa anúncios ao remover o item correspondente.
- Duas compras simultâneas do mesmo anúncio de unidade única: apenas a primeira transação aprovada prevalece; a segunda é recusada antes da cobrança efetiva.
- Item do carrinho fica indisponível (vendido/desativado/preço alterado) entre a adição e o checkout: o comprador é avisado antes de confirmar e pode remover o item ou aceitar o novo preço; o checkout nunca cobra valor diferente do exibido.
- Pagamento único do carrinho falha ou expira: nenhum dos pedidos é efetivado e todas as unidades reservadas de todos os anúncios retornam à disponibilidade.
- Frete de múltiplos anúncios do mesmo vendedor num pedido: cobrado um único frete por pedido (envio único), conforme a regra de combinação definida nas assumptions.
- Pagamento aprovado mas falha subsequente do sistema: a transação nunca fica em estado inconsistente — ou avança com registro completo, ou é revertida com estorno e auditoria.
- Comprador some após o envio: liberação automática ao vendedor após o prazo contado a partir da data de postagem (FR-030), desde que não haja disputa aberta.
- Vendedor não envia dentro do prazo: comprador pode cancelar com reembolso integral.
- Código de rastreio inválido ou sem movimentação: pedido sinalizado para acompanhamento e elegível a disputa.
- Endereço salvo é editado ou removido do perfil após uma compra: pedidos existentes mantêm o endereço congelado no momento da compra, inalterado.
- Transportadora "outra" (fora da lista conhecida): o pedido exibe o nome informado e o código de rastreio, sem link de rastreamento automático.
- Partes não respondem à solicitação de informações da disputa dentro do prazo: o administrador decide com as evidências disponíveis; a disputa nunca fica bloqueada aguardando indefinidamente.
- Todos os administradores disponíveis são parte do pedido em disputa: a disputa permanece na fila até outro administrador assumir; o sistema nunca permite a autodecisão.
- Conta social sem e-mail compartilhado ou e-mail já cadastrado: fluxo de vinculação/erro claro, sem contas duplicadas silenciosas.
- Link de coleção compartilhado e depois tornado privado: acessos subsequentes são negados com mensagem clara, sem vazar conteúdo ou metadados.
- Dono oculta valores/quantidades com a visão pública já aberta em outro dispositivo: a próxima atualização/recarga da visão pública já respeita a nova configuração.
- Visitante inicia uma compra e cria conta no meio do fluxo: após o cadastro, retorna ao anúncio de origem; se o anúncio foi vendido nesse intervalo, é informado claramente.
- Mesma carta em várias wishlists do usuário: o alvo é avaliado por carta e o usuário recebe no máximo uma notificação por evento de alvo atingido, não uma por wishlist.
- Permissão de notificação negada no sistema operacional: notificações push não são entregues, mas os indicadores de alvo atingido nas telas continuam funcionando; o app explica como reativar a permissão.
- Preço-alvo implausível (zero ou negativo): entrada rejeitada com mensagem clara; o campo permanece opcional.
- Fonte de preços indisponível: nenhuma notificação de alvo é gerada com dados desatualizados; avaliações de alvo retomam no próximo ciclo bem-sucedido.
- Oscilação de preço em torno do alvo (sobe e desce repetidamente): a regra de rearme + intervalo mínimo impede rajadas de notificações pela mesma carta.
- Perda de conectividade durante uso: estados de carregamento, erro e nova tentativa em todas as telas; ações financeiras nunca são duplicadas por reenvio (idempotência).

## Requirements _(mandatory)_

### Functional Requirements

**Contas e perfis**

- **FR-001**: System MUST permitir cadastro e autenticação com e-mail e senha, incluindo verificação de e-mail e recuperação de senha.
- **FR-002**: System MUST permitir autenticação via login social com Google e com Apple (Sign in with Apple, exigido pela App Store quando há login social de terceiros).
- **FR-003**: System MUST manter a coleção privada por padrão e permitir ao usuário torná-la pública ou compartilhá-la por link somente leitura.
- **FR-003a**: System MUST permitir ao dono da coleção controlar granularmente o que é visível publicamente: lista de cartas (sim/não), valores individuais e total (sim/não) e quantidade de cada carta (sim/não); alterações valem imediatamente para a visão pública.
- **FR-003b**: System MUST permitir que visitantes não autenticados visualizem, em modo somente leitura, coleções públicas via link compartilhável — incluindo imagens das cartas e estatísticas básicas — respeitando as configurações de visibilidade do dono; o valor total só é exibido se o dono permitir.
- **FR-003c**: System MUST negar acesso, com mensagem clara e sem revelar conteúdo, a links de coleções privadas ou que deixaram de ser públicas.
- **FR-004**: System MUST exigir cadastro de vendedor completo antes de permitir a criação de anúncios; a verificação de identidade e dos dados bancários para recebimento é delegada ao provedor de pagamentos (que cumpre o KYC regulatório), e a plataforma MUST armazenar apenas o status da verificação (pendente, aprovada, recusada), não os documentos.
- **FR-005**: System MUST proteger dados pessoais, documentos e dados bancários conforme a LGPD, coletando apenas o necessário.

**Catálogo e registro da coleção**

- **FR-006**: System MUST oferecer um catálogo de cartas de Pokémon TCG pesquisável com autocomplete por nome, retornando edição/coleção, número da carta e imagem oficial.
- **FR-007**: System MUST suportar cartas nas versões em português e em inglês.
- **FR-008**: Users MUST be able to adicionar itens à coleção informando carta do catálogo, condição (escala: Mint, Near Mint, Excellent, Good, Played, Damaged), quantidade, idioma, variante (normal, reverse foil, holo — padrão: normal) e, opcionalmente, o preço de aquisição em BRL (maior que zero quando informado).
- **FR-009**: System MUST tratar cada combinação de carta + condição + idioma + variante como item distinto da coleção, com quantidade própria.
- **FR-010**: Users MUST be able to visualizar, editar (condição, quantidade, idioma, variante, preço de aquisição) e remover itens da coleção.
- **FR-011**: System MUST exibir a imagem oficial da carta em todos os contextos de exibição do item, correspondente ao idioma do item quando disponível (carta em português exibe a arte em português), com fallback para a imagem em inglês.

**Precificação**

- **FR-012**: System MUST exibir o preço de mercado atual de cada carta da coleção em reais (BRL), com referência ao mercado brasileiro, indicando a fonte da cotação (mercado brasileiro ou referência internacional convertida) junto à data (FR-013).
- **FR-013**: System MUST atualizar as cotações periodicamente — pelo menos uma vez ao dia para cartas presentes em coleções, wishlists e anúncios ativos (e de edições recentes/populares), e pelo menos uma vez por semana para o restante do catálogo — e exibir a data/hora da última atualização de cada cotação.
- **FR-014**: System MUST continuar exibindo a última cotação conhecida, com sua data, quando a fonte de preços estiver indisponível, sem bloquear nenhuma funcionalidade.
- **FR-015**: System MUST indicar claramente quando uma carta não possui cotação disponível e excluí-la do cálculo de valor total, com indicação ao usuário.

**Histórico e estatísticas por carta**

- **FR-037**: System MUST armazenar snapshots periódicos de preço por carta (não apenas o preço atual), a cada ciclo de atualização de cotações, como base para históricos, variações e rankings.
- **FR-038**: System MUST oferecer uma tela de detalhes por carta da coleção exibindo: preço de mercado atual, gráfico do histórico de preço ao longo do tempo, variação percentual em 7, 30 e 90 dias e desde a adição à coleção, e maior/menor preço registrado no período disponível.
- **FR-039**: System MUST exibir os valores do item considerando condição e quantidade: valor unitário correspondente à condição da carta e valor total da posição (preço unitário × quantidade).
- **FR-040**: System MUST exibir ganho/perda em reais e em percentual desde a compra quando o preço de aquisição foi informado; quando não informado, MUST exibir a variação desde a data de adição do item à coleção.
- **FR-041**: System MUST sinalizar visualmente na listagem da coleção as cartas em valorização ou desvalorização recente (indicadores de tendência).
- **FR-042**: System MUST exibir "histórico indisponível" quando não houver snapshots suficientes (nunca um gráfico vazio) e marcar como indisponíveis as variações de períodos sem dados, sem interpolar valores fictícios.
- **FR-043**: System MUST exibir o histórico de preços de mercado da carta na tela de detalhes de anúncios do marketplace, visível a compradores e visitantes, como referência de justiça do preço pedido.

**Wishlists**

- **FR-044**: Users MUST be able to criar, renomear e excluir uma ou mais wishlists nomeadas, e adicionar/remover cartas do catálogo nelas usando a mesma busca com autocomplete do registro de coleção.
- **FR-045**: Users MUST be able to definir, opcionalmente, um preço-alvo em BRL (maior que zero quando informado) para cada carta de uma wishlist, editável a qualquer momento.
- **FR-046**: System MUST enviar notificação push quando, em um ciclo de atualização de cotações, o preço de mercado de uma carta com preço-alvo ficar igual ou abaixo do alvo — no máximo uma notificação por carta por evento, mesmo que a carta esteja em várias wishlists.
- **FR-047**: System MUST evitar notificações repetidas pela mesma carta: após notificar, MUST voltar a notificar somente se o preço subir acima do alvo e cair novamente (rearme) — e, mesmo tendo rearmado, somente após decorrido o intervalo mínimo configurado desde a última notificação. O rearme é a única condição que volta a habilitar a notificação; o intervalo mínimo é uma condição adicional, que impede rajadas quando o preço oscila em torno do alvo entre ciclos.
- **FR-048**: Users MUST be able to ativar/desativar notificações por wishlist e globalmente; a desativação MUST NOT afetar os indicadores visuais nas telas.
- **FR-049**: System MUST exibir, para cada carta de wishlist: preço de mercado atual, preço-alvo (quando definido), diferença entre eles e indicador visual de "atingiu o alvo"; cartas sem cotação exibem "preço indisponível" e não geram notificações.
- **FR-050**: System MUST destacar, na tela da wishlist e nas notificações, a existência de anúncios ativos no marketplace com preço igual ou abaixo do alvo, com atalho direto para o anúncio.
- **FR-051**: System MUST sinalizar nas wishlists as cartas que o usuário já possui na coleção e oferecer opção configurável de removê-las automaticamente da wishlist ao serem adquiridas.
- **FR-052**: System MUST, ao registrar na coleção uma carta presente em wishlist — por qualquer método (manual, scanner ou compra no marketplace) —, perguntar ao usuário se deseja removê-la das wishlists, exceto quando a remoção automática estiver ativada.

**Estatísticas**

- **FR-016**: System MUST exibir o valor total estimado da coleção como a soma de (cotação × quantidade) dos itens com preço disponível.
- **FR-017**: System MUST registrar e exibir a evolução do valor total da coleção ao longo do tempo.
- **FR-018**: System MUST exibir a distribuição da coleção por edição, raridade e tipo.
- **FR-019**: System MUST exibir o ranking das cartas mais valiosas da coleção.
- **FR-020**: System MUST exibir o progresso de completude por edição (cartas possuídas vs. total da edição).
- **FR-020a**: System MUST exibir no dashboard rankings derivados dos dados por carta: maiores valorizações e desvalorizações do período e cartas com maior ganho/perda em relação ao preço de aquisição (apenas itens com esse preço informado).

**Adição por câmera (sessões de escaneamento)**

- **FR-021**: System MUST oferecer sessões de escaneamento com câmera em modo contínuo, desenhando molduras em tempo real ao redor de cada carta detectada, acompanhando sua posição na tela; múltiplas cartas visíveis simultaneamente MUST receber molduras individuais.
- **FR-022**: System MUST adicionar automaticamente à sessão (não à coleção) cada carta identificada com confiança suficiente, alterando o estado visual da moldura para "capturada" e mantendo um contador visível de cartas capturadas na sessão.
- **FR-023**: System MUST marcar como "a revisar" as identificações ambíguas, registrando na sessão as opções mais prováveis para escolha posterior do usuário, sem interromper o fluxo de escaneamento.
- **FR-024**: System MUST permanecer plenamente utilizável sem a funcionalidade de câmera (indisponibilidade, permissão negada ou falha de identificação), mantendo o registro manual como caminho completo.
- **FR-053**: System MUST reconhecer como duplicata uma carta já capturada na mesma sessão e reapresentada à câmera, incrementando a quantidade da captura existente com indicação visual, sem criar registro repetido; a quantidade é ajustável na tela de revisão.
- **FR-054**: System MUST disparar feedback visual (animação na moldura) e sonoro a cada captura, com feedback padrão para cartas comuns e feedback especial (som e animação distintos, celebratórios) para: cartas de raridade alta (tiers configuráveis), cartas com valor de mercado acima de um limiar configurável e cartas presentes em wishlists do usuário — neste último caso indicando qual wishlist e se o preço atual está no alvo.
- **FR-055**: System MUST permitir desativar os sons nas configurações e MUST NOT permitir que qualquer feedback trave ou atrase o fluxo de detecção contínua.
- **FR-056**: System MUST exibir, ao encerrar a sessão, uma tela de revisão onde o usuário pode: corrigir identificações, resolver as cartas "a revisar", ajustar quantidade, condição e idioma de cada captura, excluir capturas erradas e adicionar manualmente cartas não detectadas.
- **FR-057**: System MUST exibir na revisão um resumo estatístico da sessão: total de cartas, valor de mercado total estimado, distribuição por raridade e por edição, carta mais valiosa e quantidade de cartas presentes em wishlists.
- **FR-058**: System MUST adicionar as cartas à coleção somente após a confirmação do usuário na revisão (aplicando então a pergunta de remoção de wishlist, FR-052) e MUST permitir descartar a sessão inteira sem alterar a coleção.
- **FR-059**: System MUST tornar recuperáveis as sessões interrompidas (app fechado, ligação recebida): ao reabrir, o usuário pode retomar a sessão pendente ou descartá-la.
- **FR-060**: System MUST detectar cartas em condições normais de iluminação doméstica, dentro ou fora de sleeves. Para cartas foil, sleeves reflexivos e reflexos de luz, a detecção é em melhor esforço: quando a identificação confiante não for possível, a carta MUST entrar na sessão como "a revisar" (FR-023), sem interromper o fluxo; a meta de identificação de SC-006 não se aplica a superfícies reflexivas adversas.
- **FR-061**: System MUST oferecer, durante a sessão, um botão visível para alternar entre a câmera traseira (padrão) e a frontal, com detecção, molduras e feedbacks funcionando da mesma forma em ambas; a preferência de câmera MUST ser lembrada para as próximas sessões.
- **FR-062**: System MUST oferecer, ao iniciar a sessão, um toggle visível de gravação (desligado por padrão) que, quando ativo, grava o que o usuário vê na tela — vídeo da câmera com molduras de detecção, animações e contadores sobrepostos — incluindo o áudio dos feedbacks sonoros.
- **FR-063**: A gravação MUST NOT degradar perceptivelmente a detecção em tempo real; se o aparelho não tiver capacidade de gravar e detectar simultaneamente, o app MUST informar o usuário e desativar a gravação, mantendo o escaneamento funcionando.
- **FR-064**: System MUST permitir, na tela de revisão da sessão, assistir ao vídeo gravado e escolher entre: salvar na galeria do celular, compartilhar via compartilhamento nativo do sistema ou descartar o vídeo; descartar o vídeo MUST NOT descartar as cartas da sessão.
- **FR-065**: System MUST oferecer, opcionalmente, um encerramento visual ao final da gravação com o resumo da sessão (total de cartas, valor estimado, carta mais rara/valiosa) como última cena do vídeo, tornando-o autocontido para compartilhamento.
- **FR-066**: Os vídeos gravados MUST permanecer exclusivamente no dispositivo do usuário; System MUST NOT enviar vídeos de sessão aos servidores da plataforma.
- **FR-067**: System MUST identificar automaticamente o idioma da carta capturada (português ou inglês nesta fase), registrando-o na captura sem intervenção do usuário; quando o idioma não for determinável com confiança, MUST assumir inglês como padrão, ajustável na tela de revisão (FR-056).

**Explorador de catálogo**

- **FR-068**: System MUST oferecer navegação pública pelo catálogo completo — lista de todas as edições (logo, data de lançamento, total de cartas) e grade de cartas de cada edição com imagens (idioma do usuário quando disponível, fallback inglês) — acessível também a visitantes não autenticados.
- **FR-069**: System MUST oferecer busca global de cartas por nome em qualquer idioma suportado, com filtros combináveis por edição, raridade, tipo e faixa de preço; com filtro de preço ativo, cartas sem cotação MUST ficar de fora dos resultados com indicação clara.
- **FR-070**: System MUST oferecer tela de detalhe de qualquer carta a partir do catálogo, sem exigir posse ou conta: imagem em alta resolução, dados da carta, preço de mercado atual com fonte e data (FR-012/FR-013) e histórico de preço (FR-038/FR-043).
- **FR-071**: Para usuários autenticados, a tela de detalhe MUST indicar se e quantas cópias o usuário possui na coleção e oferecer ações rápidas: adicionar à coleção, adicionar a uma wishlist e ver anúncios ativos da carta no marketplace.
- **FR-072**: System MUST tornar a completude por edição (FR-020) navegável a partir do catálogo para usuários autenticados: dentro da edição, exibir quais cartas o usuário possui e quais faltam, com atalho para adicionar as faltantes a uma wishlist; indicadores de posse/completude MUST NOT aparecer para visitantes.

**Marketplace e pagamentos**

- **FR-025**: Users MUST be able to anunciar itens da própria coleção definindo preço, condição e frete — valor fixo definido pelo vendedor ou frete incluso no preço; a quantidade anunciada MUST NOT exceder a quantidade possuída.
- **FR-026**: Users MUST be able to navegar, buscar e filtrar anúncios por nome, edição, condição, idioma e faixa de preço; a navegação, busca e filtragem MUST estar disponível também a visitantes não autenticados.
- **FR-026a**: System MUST exigir conta para comprar, vender, manter coleção (criar/adicionar cartas) ou manter wishlists — inclusive quando a ação parte do explorador de catálogo; quando um visitante não autenticado tentar uma dessas ações, o app MUST conduzi-lo ao cadastro/login e retorná-lo ao ponto de origem após a autenticação.
- **FR-027**: System MUST processar o pagamento dentro da plataforma, aceitando Pix e cartão de crédito, e reter o valor em custódia até a conclusão do fluxo.
- **FR-028**: System MUST reter uma comissão percentual da plataforma sobre cada venda concluída, deduzida no momento da liberação ao vendedor; a comissão incide apenas sobre o valor do item — o frete é repassado integralmente ao vendedor.
- **FR-029**: System MUST conduzir o pedido pelo fluxo: pago → envio confirmado pelo vendedor com transportadora e código de rastreio → recebimento confirmado pelo comprador → valor liberado ao vendedor (itens do pedido menos comissão, mais frete).
- **FR-030**: System MUST liberar automaticamente o valor ao vendedor quando o comprador não confirmar o recebimento dentro do prazo definido contado a partir da data de postagem, desde que não haja disputa aberta; dentro desse prazo o comprador MUST poder abrir disputa por não recebimento.
- **FR-031**: System MUST permitir ao comprador cancelar o pedido com reembolso integral (itens + frete) a qualquer momento enquanto o pedido estiver pago e não enviado — incluindo quando o vendedor não confirmar o envio dentro do prazo definido; após o envio, o cancelamento só ocorre via disputa.
- **FR-032**: System MUST oferecer mecanismo de disputa (item não recebido ou diferente do anunciado) que suspende a liberação do valor até a resolução, com registro de evidências de ambas as partes e desfechos de reembolso ao comprador ou liberação ao vendedor.
- **FR-033**: System MUST impedir venda duplicada do mesmo item: ao concluir uma compra, o anúncio (ou a unidade vendida) sai imediatamente de circulação.
- **FR-034**: System MUST validar rigorosamente toda operação financeira antes de efetivá-la e tratar explicitamente todas as falhas, sem jamais deixar transações em estado inconsistente; operações sujeitas a repetição MUST ser idempotentes.
- **FR-035**: System MUST registrar trilha de auditoria imutável de toda movimentação financeira (quem, o quê, quando, valores, estado anterior e posterior).
- **FR-036**: System MUST permitir avaliação mútua após a conclusão do pedido — o comprador avalia o vendedor e o vendedor avalia o comprador, uma avaliação de cada parte por pedido — e calcular a reputação de cada um a partir das avaliações recebidas: a do vendedor visível em seus anúncios e perfil; a do comprador visível em seu perfil.
- **FR-082**: System MUST oferecer um carrinho onde o comprador acumula anúncios de um ou mais vendedores; no checkout, o sistema MUST gerar um pedido por vendedor (itens do mesmo vendedor agrupados, com frete e endereço próprios), cobrar o pagamento único do total de todos os pedidos e, após a aprovação, conduzir cada pedido por fluxo independente (envio, recebimento, liberação, disputa e avaliação por pedido). Se o pagamento falhar, nenhum pedido é efetivado e todas as unidades reservadas retornam aos anúncios.

**Envio e entrega**

- **FR-073**: System MUST coletar o endereço de entrega do comprador no checkout, com opção de salvar endereços no perfil para reuso em compras futuras.
- **FR-074**: System MUST congelar o endereço de entrega no pedido no momento da compra (edições ou remoções posteriores de endereços do perfil não o afetam); o endereço MUST ser visível apenas ao comprador e ao vendedor daquele pedido enquanto ele estiver em andamento — nunca a outros usuários ou visitantes (LGPD).
- **FR-075**: System MUST exibir o total da compra — itens + frete de cada pedido gerado — antes da confirmação; o valor cobrado MUST corresponder exatamente ao total exibido.
- **FR-076**: System MUST exigir, na confirmação de envio, a transportadora (Correios, Jadlog, Loggi ou outra, com nome informado) e o código de rastreio — ambos obrigatórios; o comprador MUST ver transportadora, código e link de rastreamento no pedido.
- **FR-077**: System MUST devolver ao comprador o valor total pago (item + frete) em qualquer reembolso — cancelamento ou disputa resolvida a seu favor.

**Administração de disputas**

- **FR-078**: System MUST oferecer aos administradores da plataforma (papel restrito à equipe interna) uma fila de disputas abertas com acesso aos detalhes do pedido e às evidências enviadas pelas partes; usuários sem o papel MUST NOT acessar a área.
- **FR-079**: System MUST permitir ao administrador registrar o desfecho da disputa — reembolso integral ao comprador ou liberação ao vendedor — executando a movimentação financeira correspondente, notificando as partes e gravando em trilha de auditoria a decisão com o administrador responsável; o administrador MAY condicionar o reembolso à devolução do item (com frete de devolução por conta do vendedor), acompanhada manualmente e registrada nas notas da resolução — não há fluxo automatizado de devolução nesta fase.
- **FR-080**: System MUST permitir ao administrador solicitar informações adicionais às partes antes de decidir, com notificação e prazo de resposta; expirado o prazo sem resposta, a decisão MUST poder ser tomada com as evidências disponíveis.
- **FR-081**: System MUST impedir que um administrador visualize ou decida disputas de pedidos em que seja parte (comprador ou vendedor).

### Key Entities

- **Usuário**: pessoa com conta no app; possui credenciais, perfil, configuração de privacidade da coleção e, opcionalmente, um Perfil de Vendedor.
- **Configuração de Visibilidade da Coleção**: preferências do dono sobre a visão pública da coleção — status (privada/pública/por link), lista de cartas (sim/não), valores (sim/não), quantidades (sim/não) — aplicadas a qualquer visualização por terceiros, autenticados ou não.
- **Visitante**: pessoa sem conta (ou não autenticada); pode visualizar coleções públicas via link e navegar/buscar anúncios do marketplace, mas não pode comprar, vender ou manter coleção.
- **Perfil de Vendedor**: extensão do usuário habilitada para vender; a verificação de identidade e dados bancários é feita pelo provedor de pagamentos, e a plataforma guarda apenas o status (pendente, aprovada, recusada); pré-requisito para anunciar.
- **Carta (Catálogo)**: carta oficial de Pokémon TCG com nome, edição/coleção, número, raridade, tipo, idioma disponível (PT/EN) e imagem oficial; origem em fonte externa de catálogo.
- **Edição/Coleção (Set)**: agrupamento oficial de cartas com total conhecido, logo e data de lançamento; usado para completude (FR-020/FR-072) e navegação do explorador de catálogo (FR-068).
- **Item da Coleção**: vínculo entre usuário e carta do catálogo com condição, idioma, variante (normal, reverse foil, holo), quantidade, data de adição e preço de aquisição opcional; unidade básica do inventário.
- **Cotação de Preço**: preço de mercado em BRL de uma carta (considerando condição/idioma quando disponível), com data/hora da atualização e origem; mantém última versão conhecida como fallback.
- **Snapshot de Preço da Carta**: registro histórico periódico do preço de uma carta (por condição/idioma quando disponível), gerado a cada ciclo de atualização de cotações; base dos gráficos de histórico, variações percentuais, maior/menor preço, indicadores de tendência e rankings de valorização.
- **Snapshot de Valor da Coleção**: registro periódico do valor total da coleção de um usuário, base da evolução temporal.
- **Sessão de Escaneamento**: lote de capturas por câmera de um usuário, com status (ativa, pendente/interrompida, confirmada, descartada); contém capturas com estado (identificada, "a revisar", duplicata incrementada), atributos ajustáveis (condição, quantidade, idioma), câmera em uso (traseira/frontal), gravação opcional de vídeo e resumo estatístico; só altera a coleção quando confirmada.
- **Gravação de Sessão**: vídeo local vinculado a uma sessão de escaneamento — visão da tela com molduras, animações, contadores e áudio dos feedbacks, com encerramento visual opcional; armazenado exclusivamente no dispositivo, com destinos possíveis: galeria, compartilhamento nativo ou descarte (sem afetar as capturas).
- **Wishlist**: lista de desejos nomeada pertencente a um usuário, com configuração própria de notificações; um usuário pode ter várias.
- **Item de Wishlist**: vínculo entre wishlist e carta do catálogo, com preço-alvo opcional e estado de notificação (última notificação enviada, alvo rearmado ou não); base dos indicadores de "atingiu o alvo" e da sinalização de "já na coleção".
- **Anúncio**: oferta de venda de um item da coleção com preço, condição, quantidade, frete (valor fixo ou incluso no preço) e status (ativo, vendido, desativado).
- **Carrinho**: acumulador de anúncios (com quantidades) de um ou mais vendedores, pertencente ao comprador; no checkout é convertido em um pedido por vendedor com pagamento único; itens indisponíveis são sinalizados antes da confirmação.
- **Endereço de Entrega**: endereço salvo pelo usuário no perfil para reuso em compras; o pedido guarda uma cópia congelada no momento da compra.
- **Pedido/Transação**: compra de um anúncio com estados (pago, enviado, recebido, liberado, cancelado, em disputa, reembolsado), valores (item, frete, total, comissão, líquido do vendedor), endereço de entrega congelado, transportadora, código de rastreio e prazos.
- **Disputa**: contestação vinculada a um pedido, com motivo, evidências das partes, solicitações de informação adicional, status (aberta, aguardando as partes, resolvida) e desfecho com o administrador responsável.
- **Administrador**: membro da equipe interna da plataforma com papel restrito; opera a fila de disputas (visualizar, solicitar informações, decidir); impedido de operar disputas de pedidos em que seja parte.
- **Avaliação**: nota e comentário de uma parte sobre a outra após conclusão do pedido (comprador → vendedor e vendedor → comprador, uma de cada por pedido); compõe a reputação de quem a recebe.
- **Registro de Auditoria**: entrada imutável descrevendo cada movimentação financeira com autor, ação, valores, timestamps e estados anterior/posterior.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Um usuário novo cria conta e adiciona sua primeira carta à coleção em menos de 3 minutos.
- **SC-002**: Adicionar uma carta pelo registro manual (busca + confirmação) leva menos de 30 segundos por carta.
- **SC-003**: 95% das buscas no catálogo com autocomplete exibem sugestões em menos de 1 segundo.
- **SC-004**: 100% das cartas da coleção com cotação disponível exibem preço em BRL e data da última atualização; cotações de cartas em coleções, wishlists e anúncios ativos (e de edições recentes/populares) nunca ficam mais de 24 horas sem tentativa de atualização, e as do restante do catálogo nunca mais de 7 dias.
- **SC-005**: Com a fonte de preços indisponível, 100% das funcionalidades do app permanecem operacionais exibindo as últimas cotações conhecidas.
- **SC-006**: O scanner identifica corretamente (na captura automática ou entre as opções de "a revisar") pelo menos 80% das cartas em condições normais de iluminação doméstica, dentro ou fora de sleeves, a um ritmo médio de pelo menos 10 cartas por minuto no modo contínuo.
- **SC-006a**: O tempo entre enquadrar uma carta detectável e sua captura na sessão é de no máximo 2 segundos em condições normais.
- **SC-006b**: Nenhuma carta entra na coleção sem confirmação da revisão em 100% das sessões; sessões descartadas não deixam nenhum item na coleção.
- **SC-006c**: 100% das sessões interrompidas são recuperáveis (retomar ou descartar) na reabertura do app, sem perda das capturas já realizadas.
- **SC-006d**: Com a gravação ativa, o desempenho de detecção mantém os patamares de SC-006 e SC-006a (sem degradação perceptível); em aparelhos sem capacidade, a gravação é desativada com aviso em 100% dos casos, sem interromper o escaneamento.
- **SC-006e**: 100% dos vídeos de sessão permanecem apenas no dispositivo (nenhum tráfego de vídeo aos servidores da plataforma), e descartar o vídeo preserva 100% das capturas da sessão.
- **SC-006f**: O idioma é identificado corretamente em pelo menos 90% das capturas de cartas em português ou inglês em condições normais; capturas com idioma indeterminado entram como inglês em 100% dos casos, nunca sem idioma.
- **SC-007**: 100% dos fluxos do app são completáveis sem uso da câmera.
- **SC-008**: Um comprador completa uma compra no marketplace (do anúncio ao pagamento confirmado) em menos de 3 minutos.
- **SC-009**: 100% das movimentações financeiras possuem registro de auditoria completo; nenhuma transação termina em estado inconsistente nos testes de falha (pagamento recusado, interrupção no meio do fluxo, reenvio duplicado).
- **SC-010**: O valor liberado ao vendedor é exatamente o valor dos itens do pedido menos a comissão percentual, mais o frete integral, em 100% das vendas concluídas; o valor cobrado do comprador é exatamente o total (itens + fretes de todos os pedidos do checkout) exibido antes da confirmação.
- **SC-011**: 90% dos usuários de teste completam o registro de uma carta e a leitura do valor da coleção sem ajuda na primeira tentativa.
- **SC-012**: Um visitante sem conta abre um link de coleção pública e visualiza as cartas em menos de 5 segundos, sem nenhuma etapa de cadastro; 100% das visões públicas respeitam as configurações de visibilidade do dono nos testes.
- **SC-013**: 100% das tentativas de compra, venda ou criação de coleção por visitantes não autenticados resultam em direcionamento ao cadastro/login, com retorno ao ponto de origem após a autenticação.
- **SC-014**: 100% das cartas da coleção com cotação exibem tela de detalhes com valor unitário pela condição e valor total da posição; cartas com histórico suficiente exibem gráfico e variações por período, e as demais exibem "histórico indisponível" — nunca um gráfico vazio ou variação enganosa.
- **SC-015**: Para 100% dos itens com preço de aquisição informado, o ganho/perda exibido em reais e percentual corresponde exatamente à diferença entre a cotação atual e o preço pago.
- **SC-016**: Após cada ciclo de atualização de cotações (diário prioritário ou rotativo do restante do catálogo), 100% das cartas com preço obtido naquele ciclo têm um novo snapshot registrado no histórico.
- **SC-017**: Um usuário cria uma wishlist e adiciona uma carta com preço-alvo em menos de 1 minuto.
- **SC-018**: 100% das notificações de preço-alvo correspondem a um preço de mercado igual ou abaixo do alvo no momento do envio; nenhuma carta gera mais de uma notificação sem rearme ou sem o intervalo mínimo decorrido nos testes de oscilação.
- **SC-019**: 100% das cartas de wishlist já presentes na coleção aparecem sinalizadas, e o registro de uma carta em wishlist na coleção sempre dispara a pergunta de remoção (ou a remoção automática, quando ativada).
- **SC-020**: Qualquer pessoa (com ou sem conta) chega da lista de edições ao detalhe de uma carta em no máximo 3 toques; 100% das cartas e edições do catálogo são acessíveis sem conta.
- **SC-021**: 95% das buscas globais do catálogo (nome + filtros) exibem resultados em menos de 1 segundo; a visão de completude de uma edição reflete exatamente a contagem possuídas/faltantes da coleção do usuário em 100% dos testes.
- **SC-022**: 100% das decisões de disputa registram em auditoria o administrador responsável, o desfecho e a movimentação financeira correspondente; nenhuma disputa é decidida por administrador que seja parte do pedido nos testes.
- **SC-023**: 100% das disputas recebem primeira resposta da operação dentro do prazo-alvo e nenhuma permanece sem desfecho após o prazo-alvo de resolução (medido sobre a operação em produção; nos testes, os prazos disparam os indicadores de acompanhamento da fila).

## Assumptions

- A comissão da plataforma é um percentual único configurável pela operação (valor definido pelo negócio, não fixado nesta especificação); mudanças de percentual valem apenas para vendas futuras.
- Os preços de referência vêm de fonte externa do mercado brasileiro de cartas como primária, com fallback por carta em fonte internacional (USD convertido diariamente a BRL) quando a carta não tem preço na primária ou a coleta falha; a fonte pode falhar ou mudar, por isso o sistema mantém cache e a última cotação conhecida como fallback (conforme constituição do projeto), sempre exibindo fonte e data da cotação.
- O catálogo de cartas (nomes, edições, números, imagens oficiais) vem de fonte externa reconhecida de dados de Pokémon TCG, com atualização periódica para novas edições.
- A escala de condição adotada é a de mercado: Mint, Near Mint, Excellent, Good, Played, Damaged.
- O sistema não tem integração com APIs de transportadoras nesta fase: a liberação automática não depende de detectar a entrega — ela conta a partir da confirmação de recebimento pelo comprador ou, na ausência dela, de **21 dias corridos a partir da data de postagem** informada pelo vendedor (prazo configurável pela operação, com margem para o trânsito postal), sem disputa aberta. O comprador pode abrir disputa por não recebimento dentro desse prazo. Integração com APIs de rastreio para detectar a entrega automaticamente fica registrada como evolução futura.
- O vendedor tem 5 dias úteis após o pagamento para confirmar o envio com transportadora e rastreio. O comprador pode cancelar com reembolso integral (itens + frete) a qualquer momento antes do envio; estourado o prazo, o pedido é sinalizado como em atraso ao comprador, destacando a opção de cancelar.
- O envio físico é responsabilidade do vendedor via transportadora (Correios, Jadlog, Loggi ou outra); a plataforma registra e exibe transportadora e código de rastreio, com link de rastreamento montado para as transportadoras conhecidas (para "outra", exibe nome e código sem link), mas não gerencia logística.
- O frete é um valor fixo por anúncio definido pelo vendedor (ou incluso no preço); não há cálculo de frete por CEP, peso ou dimensões nesta fase.
- Quando um pedido agrupa múltiplos anúncios do mesmo vendedor (carrinho), o frete do pedido é o **maior** valor de frete entre os anúncios agrupados (envio único — não soma fretes); anúncios com frete incluso não adicionam frete. Regra configurável pela operação.
- O carrinho é local ao comprador e não reserva estoque: as unidades só são reservadas na confirmação do checkout, quando os pedidos são criados.
- A comissão da plataforma incide apenas sobre o valor do item; o frete integra o valor retido em custódia e é repassado integralmente ao vendedor na liberação (e devolvido ao comprador em reembolsos).
- O endereço de entrega congelado no pedido deixa de ser exibido ao vendedor após a conclusão do pedido (liberado/cancelado/reembolsado), permanecendo registrado no pedido para fins de auditoria e disputa (LGPD — minimização de exposição).
- Resolução de disputas nesta fase é feita por administradores da plataforma (US11) com base nas evidências registradas; automação de disputas fica para fases futuras.
- Prazos-alvo da operação de disputas (configuráveis): primeira resposta em até 1 dia útil e resolução em até 7 dias corridos da abertura; prazo de resposta das partes a solicitações de informação adicional: 3 dias corridos.
- Devolução de item em disputa é decidida caso a caso pelo administrador (condição registrada nas notas da resolução, frete de devolução por conta do vendedor quando exigida); um fluxo automatizado de devolução com rastreio fica para fases futuras.
- Preços de anúncio são livres (definidos pelo vendedor); a cotação de mercado e o histórico de preços servem apenas como referência exibida.
- Anúncios com múltiplas unidades admitem compra parcial: o pedido tem quantidade própria; as unidades são reservadas na criação do pedido e devolvidas ao anúncio se o pagamento falhar ou expirar dentro da janela de pagamento do provedor.
- O pedido guarda um retrato dos dados da carta e do preço no momento da compra: edições ou remoções posteriores do anúncio ou da coleção do vendedor não afetam pedidos em andamento.
- O preço-alvo da wishlist é avaliado contra o menor preço vigente entre as variantes da carta (a wishlist é da carta, não de uma variante); a notificação e a tela indicam qual variante atingiu o alvo.
- "Edições recentes/populares" (priorização de cotações e imagens): recentes = lançadas nos últimos 12 meses; populares = as N edições com mais itens em coleções, wishlists e anúncios da plataforma (N configurável pela operação; padrão sugerido: 20).
- Snapshots de preço por carta são gerados a cada ciclo de atualização de cotações (pelo menos diário) e retidos integralmente nesta fase; políticas de agregação/expurgo de histórico antigo ficam para fases futuras.
- "Valorização/desvalorização recente" para o indicador de tendência é definida como variação nos últimos 7 dias acima de um limiar configurável pela operação (padrão sugerido: ±5%).
- "Histórico suficiente" para exibir gráfico exige pelo menos 2 snapshots em datas distintas; variações por período exigem snapshot no início aproximado do período.
- O preço de aquisição é informado manualmente pelo usuário, opcional e apenas referencial — não participa de nenhum cálculo financeiro do marketplace.
- A avaliação de preço-alvo das wishlists ocorre a cada ciclo de atualização de cotações (não em tempo real) e usa o preço de mercado como gatilho; anúncios do marketplace abaixo do alvo são um destaque adicional, não o gatilho da notificação.
- Intervalo mínimo padrão entre notificações da mesma carta: 24 horas (configurável pela operação), combinado com a regra de rearme (preço subir acima do alvo e cair novamente).
- Notificações push dependem do serviço de notificações do sistema operacional e da permissão do usuário; sem permissão, os indicadores nas telas permanecem como alternativa.
- Wishlists são privadas nesta fase; compartilhamento ou visibilidade pública de wishlists fica para fases futuras.
- Comportamento de duplicata na sessão de escaneamento: incremento automático da quantidade com indicação visual (sem perguntar a cada reapresentação), ajustável na tela de revisão — escolhido para não interromper o ritmo do scanner contínuo.
- Tiers de raridade que ativam o feedback especial: raridades acima de "Rara" comum (ex.: Rara Holo, ex/V e equivalentes, Ilustração Rara, Ilustração Especial Rara, Secreta), em lista configurável pela operação conforme a nomenclatura vigente do TCG.
- Limiar de valor de mercado para feedback especial: configurável pela operação (padrão sugerido: R$ 50).
- Sessões pendentes são retidas até o usuário retomá-las ou descartá-las; apenas uma sessão pendente por usuário por vez (iniciar nova sessão exige resolver a pendente).
- O resumo estatístico da sessão usa as cotações vigentes no momento da revisão (últimas conhecidas, em caso de fonte indisponível).
- A identificação de idioma no scanner usa o texto impresso da carta durante o mesmo processo de identificação da captura (sem etapa extra para o usuário); idiomas suportados nesta fase: português e inglês.
- O catálogo suporta múltiplos idiomas por carta (nome e imagem localizados), populado em português e inglês nesta fase; nomes e imagens localizados em português dependem da disponibilidade na(s) fonte(s) de catálogo — a versão em inglês existe para 100% das cartas e é o fallback universal.
- O catálogo completo é público por natureza (dados oficiais de terceiros): navegá-lo não expõe nenhum dado de usuários; logos e datas de lançamento das edições vêm das fontes de catálogo, com placeholder quando ausentes.
- O filtro de faixa de preço do explorador usa a cotação vigente (qualquer fonte); cartas sem cotação ficam fora do filtro com indicação.
- A preferência de câmera (traseira/frontal) é lembrada por dispositivo; a câmera traseira é o padrão inicial.
- A gravação registra a experiência tal como exibida (com ou sem áudio de feedback, conforme a configuração de sons do usuário no momento) e é limitada pelo armazenamento disponível no aparelho; não há limite de duração imposto pelo app nesta fase.
- O vídeo da sessão é retido junto à sessão até o usuário salvá-lo, compartilhá-lo ou descartá-lo; descartar a sessão inteira também descarta o vídeo associado.
- O encerramento visual do vídeo usa os mesmos dados do resumo estatístico da revisão e é oferecido como opção no momento de salvar/compartilhar (não altera o vídeo original já gravado até o usuário optar).
- O link compartilhável de coleção usa um identificador não adivinhável e pode ser revogado pelo dono (tornar a coleção privada invalida o acesso pelo link).
- Padrão das configurações de visibilidade ao tornar a coleção pública: lista de cartas visível, valores ocultos, quantidades ocultas — o dono ajusta a partir daí.
- A visão pública de coleção e a navegação de anúncios por visitantes são somente leitura e não expõem dados pessoais do dono além do nome/apelido público do perfil.
- Público-alvo no Brasil: idioma do app em português, moeda exclusivamente BRL, conformidade com LGPD.
- Escala esperada no primeiro ano: até ~10 mil usuários, coleções de até ~10 mil cartas por usuário e ~1 mil anúncios ativos; metas de desempenho e dimensionamento calibrados para essa ordem de grandeza, sem superengenharia, revisáveis com tração.
- Fora de escopo nesta fase: trocas (trade) entre usuários, leilões, cartas de outros jogos além de Pokémon TCG e aplicativo desktop.
