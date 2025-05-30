<<<<<<< HEAD
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');

// Configuração dos números de administrador
// ATENÇÃO: Substitua pelos números de telefone (com DDI e DDD, sem + ou espaços)
const ADMIN_NUMBERS = [
    '553197757240' // Exemplo: seu número
    // Adicione mais números se necessário
];

// Estado de conversação para comandos de múltiplos passos
const conversationState = new Map(); // Key: senderNumber, Value: { step: 'waitingForGames', data: {} }

// Estado para armazenar os bolões
// Este é um exemplo simples. Em produção, considere um banco de dados.
let bolaoData = {}; // Key: nomeDoBolao (string), Value: { id: string, nome: string, jogos: [], criador: string }

// Carregar dados de bolões existentes (se houver)
function loadBolaoData() {
    try {
        const data = fs.readFileSync('bolaoData.json', 'utf8');
        bolaoData = JSON.parse(data);
        console.log('Dados de bolões carregados com sucesso.');
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.log('Arquivo bolaoData.json não encontrado. Iniciando com dados vazios.');
            bolaoData = {};
        } else {
            console.error('Erro ao carregar dados de bolões:', err);
            bolaoData = {};
        }
    }
}

// Salvar dados de bolões
function saveBolaoData() {
    try {
        fs.writeFileSync('bolaoData.json', JSON.stringify(bolaoData, null, 2), 'utf8');
        console.log('Dados de bolões salvos com sucesso.');
    } catch (err) {
        console.error('Erro ao salvar dados de bolões:', err);
    }
}

// Carregar dados ao iniciar
loadBolaoData();


const client = new Client({
    authStrategy: new LocalAuth({ clientId: 'bot-bolao' }),
    puppeteer: {
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process', // Isso pode ajudar em ambientes com pouca memória
            '--disable-gpu'
        ],
        headless: true // Manter como true para ambiente de servidor
    }
});

client.on('qr', qr => {
    console.log('QR RECEIVED', qr);
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('Client is ready!');
});

client.on('authenticated', () => {
    console.log('Authenticated!');
});

client.on('auth_failure', msg => {
    console.error('AUTHENTICATION FAILURE', msg);
});

client.on('disconnected', reason => {
    console.log('Client was disconnected', reason);
});

client.on('message', async msg => {
    console.log(`Mensagem de ${msg.from} (${msg.author || 'individual'}): ${msg.body}`);

    let senderNumber;
    // msg.from é o ID do chat (individual ou grupo)
    // msg.author é o ID do remetente real em um grupo
    if (msg.from.endsWith('@g.us')) { // Verifica se é um grupo
        senderNumber = msg.author || msg.from; // Usa msg.author para identificar o remetente no grupo
        console.log(`DEBUG: Mensagem é de grupo. senderNumber bruto: ${senderNumber}`);
    } else {
        senderNumber = msg.from; // Para chat individual, msg.from já é o remetente
        console.log(`DEBUG: Mensagem é individual. senderNumber bruto: ${senderNumber}`);
    }
    // Remove o sufixo '@c.us' se presente, para obter apenas o número
    senderNumber = senderNumber ? senderNumber.replace('@c.us', '') : '';
    console.log(`DEBUG: senderNumber final (limpo para comparação com ADMIN_NUMBERS): ${senderNumber}`);


    const lowerCaseBody = msg.body.toLowerCase();
    const chatState = conversationState.get(senderNumber);

    console.log(`DEBUG: lowerCaseBody: ${lowerCaseBody}`);
    console.log(`DEBUG: chatState para ${senderNumber}: ${JSON.stringify(chatState)}`);


    try {
        // --- ADMIN COMMANDS ---
        if (ADMIN_NUMBERS.includes(senderNumber)) {
            console.log(`DEBUG: ${senderNumber} é um ADMIN.`);

            if (lowerCaseBody === '!setrodada') {
                console.log(`DEBUG: Comando !setrodada detectado.`);
                await msg.reply('Certo! Agora me envie os jogos da rodada no formato: `TIME1 X TIME2` por linha. Quando terminar, digite `!fim`');
                conversationState.set(senderNumber, { step: 'waitingForGames', data: { jogos: [] } });
                return; // Importante para não processar mais nada após entrar no estado
            }

            if (chatState && chatState.step === 'waitingForGames') {
                console.log(`DEBUG: Entrou no estado waitingForGames.`);
                if (lowerCaseBody === '!fim') {
                    console.log(`DEBUG: Comando !fim detectado em waitingForGames.`);
                    const jogos = chatState.data.jogos;
                    if (jogos.length > 0) {
                        const bolaoId = `bolao-${Date.now()}`; // ID único para o bolão
                        const bolaoNome = `Rodada ${Object.keys(bolaoData).length + 1}`; // Nome padrão
                        bolaoData[bolaoId] = { id: bolaoId, nome: bolaoNome, jogos: jogos, criador: senderNumber };
                        saveBolaoData(); // Salvar os dados após a criação
                        await msg.reply(`Jogos da rodada salvos com sucesso para o bolão "${bolaoNome}"! Use !bolões para ver.`);
                    } else {
                        await msg.reply('Nenhum jogo foi adicionado. O bolão não foi criado.');
                    }
                    conversationState.delete(senderNumber); // Limpa o estado
                    return;
                } else if (lowerCaseBody.match(/^[a-zA-Z\s]+ x [a-zA-Z\s]+$/)) {
                    console.log(`DEBUG: Jogo detectado em waitingForGames: ${msg.body}`);
                    chatState.data.jogos.push(msg.body.trim());
                    await msg.reply(`"${msg.body.trim()}" adicionado. Envie o próximo jogo ou !fim para terminar.`);
                    conversationState.set(senderNumber, chatState); // Atualiza o estado
                    return;
                } else {
                    console.log(`DEBUG: Formato de jogo inválido em waitingForGames.`);
                    await msg.reply('Formato de jogo inválido. Use `TIME1 X TIME2` ou `!fim` para finalizar.');
                    return;
                }
            }

        } else {
            console.log(`DEBUG: ${senderNumber} NÃO é um ADMIN.`);
        }


        // --- Common User Commands (accessible por todos, incluindo admins) ---

        // Comando !ping para testar se o bot está vivo
        if (lowerCaseBody === '!ping') {
            console.log(`DEBUG: Comando !ping detectado.`);
            await msg.reply('pong');
            return;
        }

        // Comando !bolões para listar bolões disponíveis
        if (lowerCaseBody === '!bolões' || lowerCaseBody === '!boloes') {
            console.log(`DEBUG: Comando !bolões detectado.`);
            if (Object.keys(bolaoData).length === 0) {
                await msg.reply('Nenhum bolão disponível no momento.');
                return;
            }
            let response = 'Bolões disponíveis:\n\n';
            for (const id in bolaoData) {
                response += `*ID:* ${bolaoData[id].id}\n`;
                response += `*Nome:* ${bolaoData[id].nome}\n`;
                response += `*Jogos:* ${bolaoData[id].jogos.length} \n`;
                response += `Para ver os jogos: !jogos ${bolaoData[id].id}\n\n`;
            }
            await msg.reply(response);
            return;
        }

        // Comando !jogos <ID_DO_BOLAO>
        if (lowerCaseBody.startsWith('!jogos ')) {
            console.log(`DEBUG: Comando !jogos detectado.`);
            const bolaoId = lowerCaseBody.substring('!jogos '.length).trim();
            const bolao = bolaoData[bolaoId];

            if (bolao) {
                let response = `Jogos do bolão "${bolao.nome}" (ID: ${bolao.id}):\n\n`;
                bolao.jogos.forEach((jogo, index) => {
                    response += `${index + 1}. ${jogo}\n`;
                });
                await msg.reply(response);
            } else {
                await msg.reply('Bolão não encontrado. Verifique o ID.');
            }
            return;
        }


        // Comando !palpite <ID_DO_BOLAO> <NUMERO_JOGO> <PLACAR1> <PLACAR2>
        // Ex: !palpite bolao-12345 1 2 1
        if (lowerCaseBody.startsWith('!palpite ')) {
            console.log(`DEBUG: Comando !palpite detectado.`);
            const args = lowerCaseBody.substring('!palpite '.length).trim().split(' ');
            if (args.length === 4) {
                const bolaoId = args[0];
                const numeroJogo = parseInt(args[1]);
                const placar1 = parseInt(args[2]);
                const placar2 = parseInt(args[3]);

                const bolao = bolaoData[bolaoId];

                if (bolao && !isNaN(numeroJogo) && numeroJogo > 0 && numeroJogo <= bolao.jogos.length &&
                    !isNaN(placar1) && !isNaN(placar2) && placar1 >= 0 && placar2 >= 0) {

                    const jogoIndex = numeroJogo - 1;
                    const jogo = bolao.jogos[jogoIndex];

                    // Formato do palpite: { sender: 'número', jogo: 'TIME1 X TIME2', placar: '2 X 1' }
                    if (!bolao.palpites) {
                        bolao.palpites = [];
                    }
                    // Verifica se o usuário já palpitou para este jogo neste bolão
                    const existingPalpiteIndex = bolao.palpites.findIndex(
                        p => p.sender === senderNumber && p.jogoIndex === jogoIndex
                    );

                    if (existingPalpiteIndex !== -1) {
                        // Atualiza o palpite existente
                        bolao.palpites[existingPalpiteIndex].placar = `${placar1} X ${placar2}`;
                        await msg.reply(`Seu palpite para o jogo "${jogo}" no bolão "${bolao.nome}" foi atualizado para *${placar1} X ${placar2}*.`);
                    } else {
                        // Adiciona um novo palpite
                        bolao.palpites.push({
                            sender: senderNumber,
                            jogoIndex: jogoIndex,
                            jogo: jogo,
                            placar: `${placar1} X ${placar2}`
                        });
                        await msg.reply(`Palpite para o jogo "${jogo}" no bolão "${bolao.nome}" salvo: *${placar1} X ${placar2}*.`);
                    }
                    saveBolaoData(); // Salvar dados após o palpite
                } else {
                    await msg.reply('Formato de palpite inválido ou bolão/jogo não encontrado. Use: `!palpite <ID_DO_BOLAO> <NUMERO_JOGO> <PLACAR1> <PLACAR2>`');
                }
            } else {
                await msg.reply('Formato de palpite inválido. Use: `!palpite <ID_DO_BOLAO> <NUMERO_JOGO> <PLACAR1> <PLACAR2>`');
            }
            return;
        }

        // Comando !meuspalpites <ID_DO_BOLAO>
        if (lowerCaseBody.startsWith('!meuspalpites ')) {
            console.log(`DEBUG: Comando !meuspalpites detectado.`);
            const bolaoId = lowerCaseBody.substring('!meuspalpites '.length).trim();
            const bolao = bolaoData[bolaoId];

            if (bolao && bolao.palpites && bolao.palpites.length > 0) {
                const meusPalpites = bolao.palpites.filter(p => p.sender === senderNumber);

                if (meusPalpites.length > 0) {
                    let response = `Seus palpites para o bolão "${bolao.nome}" (ID: ${bolao.id}):\n\n`;
                    meusPalpites.forEach(palpite => {
                        response += `*Jogo ${palpite.jogoIndex + 1}:* ${palpite.jogo} -> *${palpite.placar}*\n`;
                    });
                    await msg.reply(response);
                } else {
                    await msg.reply(`Você ainda não fez nenhum palpite para o bolão "${bolao.nome}".`);
                }
            } else {
                await msg.reply('Bolão não encontrado ou nenhum palpite registrado.');
            }
            return;
        }


        // Comando !ajuda
        if (lowerCaseBody === '!ajuda' || lowerCaseBody === '!help') {
            console.log(`DEBUG: Comando !ajuda detectado.`);
            let helpMessage = `Olá! Sou o Bot do Bolão. Aqui estão os comandos que você pode usar:\n\n` +
                              `*Comandos para todos:*\n` +
                              `!ping - Verifica se o bot está online.\n` +
                              `!bolões - Lista os bolões disponíveis.\n` +
                              `!jogos <ID_DO_BOLAO> - Mostra os jogos de um bolão específico.\n` +
                              `!palpite <ID_DO_BOLAO> <NUM_JOGO> <PL_TIME1> <PL_TIME2> - Salva seu palpite para um jogo.\n` +
                              `!meuspalpites <ID_DO_BOLAO> - Vê seus palpites para um bolão.\n\n`;

            if (ADMIN_NUMBERS.includes(senderNumber)) {
                helpMessage += `*Comandos de Administrador:*\n` +
                               `!setrodada - Inicia o processo de criação de uma nova rodada de jogos.\n` +
                               `!fim - Finaliza a entrada de jogos (após !setrodada).\n`;
            }
            await msg.reply(helpMessage);
            return;
        }

    } catch (error) {
        console.error('Erro ao processar mensagem:', error);
        await client.sendMessage(msg.from, 'Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente ou verifique o formato do comando.');
    }
});

client.initialize();
=======
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');

// Configuração dos números de administrador
// ATENÇÃO: Substitua pelos números de telefone (com DDI e DDD, sem + ou espaços)
const ADMIN_NUMBERS = [
    '553197757240' // Exemplo: seu número
    // Adicione mais números se necessário
];

// Estado de conversação para comandos de múltiplos passos
const conversationState = new Map(); // Key: senderNumber, Value: { step: 'waitingForGames', data: {} }

// Estado para armazenar os bolões
// Este é um exemplo simples. Em produção, considere um banco de dados.
let bolaoData = {}; // Key: nomeDoBolao (string), Value: { id: string, nome: string, jogos: [], criador: string }

// Carregar dados de bolões existentes (se houver)
function loadBolaoData() {
    try {
        const data = fs.readFileSync('bolaoData.json', 'utf8');
        bolaoData = JSON.parse(data);
        console.log('Dados de bolões carregados com sucesso.');
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.log('Arquivo bolaoData.json não encontrado. Iniciando com dados vazios.');
            bolaoData = {};
        } else {
            console.error('Erro ao carregar dados de bolões:', err);
            bolaoData = {};
        }
    }
}

// Salvar dados de bolões
function saveBolaoData() {
    try {
        fs.writeFileSync('bolaoData.json', JSON.stringify(bolaoData, null, 2), 'utf8');
        console.log('Dados de bolões salvos com sucesso.');
    } catch (err) {
        console.error('Erro ao salvar dados de bolões:', err);
    }
}

// Carregar dados ao iniciar
loadBolaoData();

// --- NOVO LOG DE DEPURAÇÃO ---
console.log('Iniciando o bot...');

const client = new Client({
    authStrategy: new LocalAuth({ clientId: 'bot-bolao' }),
    puppeteer: {
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process', // Isso pode ajudar em ambientes com pouca memória
            '--disable-gpu'
        ],
        headless: true // Manter como true para ambiente de servidor
    }
});

// --- NOVO LOG DE DEPURAÇÃO ---
console.log('Cliente WhatsAppWeb instanciado.');

client.on('qr', qr => {
    // --- NOVO LOG DE DEPURAÇÃO ---
    console.log('QR RECEIVED', qr);
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    // --- NOVO LOG DE DEPURAÇÃO ---
    console.log('Client is ready! Bot conectado ao WhatsApp.');
});

client.on('authenticated', () => {
    // --- NOVO LOG DE DEPURAÇÃO ---
    console.log('Authenticated!');
});

client.on('auth_failure', msg => {
    // --- NOVO LOG DE DEPURAÇÃO ---
    console.error('AUTHENTICATION FAILURE', msg);
});

client.on('disconnected', reason => {
    console.log('Client was disconnected', reason);
});

client.on('message', async msg => {
    console.log(`Mensagem de ${msg.from} (${msg.author || 'individual'}): ${msg.body}`);

    let senderNumber;
    // msg.from é o ID do chat (individual ou grupo)
    // msg.author é o ID do remetente real em um grupo
    if (msg.from.endsWith('@g.us')) { // Verifica se é um grupo
        senderNumber = msg.author || msg.from; // Usa msg.author para identificar o remetente no grupo
        console.log(`DEBUG: Mensagem é de grupo. senderNumber bruto: ${senderNumber}`);
    } else {
        senderNumber = msg.from; // Para chat individual, msg.from já é o remetente
        console.log(`DEBUG: Mensagem é individual. senderNumber bruto: ${senderNumber}`);
    }
    // Remove o sufixo '@c.us' se presente, para obter apenas o número
    senderNumber = senderNumber ? senderNumber.replace('@c.us', '') : '';
    console.log(`DEBUG: senderNumber final (limpo para comparação com ADMIN_NUMBERS): ${senderNumber}`);


    const lowerCaseBody = msg.body.toLowerCase();
    const chatState = conversationState.get(senderNumber);

    console.log(`DEBUG: lowerCaseBody: ${lowerCaseBody}`);
    console.log(`DEBUG: chatState para ${senderNumber}: ${JSON.stringify(chatState)}`);


    try {
        // --- ADMIN COMMANDS ---
        if (ADMIN_NUMBERS.includes(senderNumber)) {
            console.log(`DEBUG: ${senderNumber} é um ADMIN.`);

            if (lowerCaseBody === '!setrodada') {
                console.log(`DEBUG: Comando !setrodada detectado.`);
                await msg.reply('Certo! Agora me envie os jogos da rodada no formato: `TIME1 X TIME2` por linha. Quando terminar, digite `!fim`');
                conversationState.set(senderNumber, { step: 'waitingForGames', data: { jogos: [] } });
                return; // Importante para não processar mais nada após entrar no estado
            }

            if (chatState && chatState.step === 'waitingForGames') {
                console.log(`DEBUG: Entrou no estado waitingForGames.`);
                if (lowerCaseBody === '!fim') {
                    console.log(`DEBUG: Comando !fim detectado em waitingForGames.`);
                    const jogos = chatState.data.jogos;
                    if (jogos.length > 0) {
                        const bolaoId = `bolao-${Date.now()}`; // ID único para o bolão
                        const bolaoNome = `Rodada ${Object.keys(bolaoData).length + 1}`; // Nome padrão
                        bolaoData[bolaoId] = { id: bolaoId, nome: bolaoNome, jogos: jogos, criador: senderNumber };
                        saveBolaoData(); // Salvar os dados após a criação
                        await msg.reply(`Jogos da rodada salvos com sucesso para o bolão "${bolaoNome}"! Use !bolões para ver.`);
                    } else {
                        await msg.reply('Nenhum jogo foi adicionado. O bolão não foi criado.');
                    }
                    conversationState.delete(senderNumber); // Limpa o estado
                    return;
                } else if (lowerCaseBody.match(/^[a-zA-Z\s]+ x [a-zA-Z\s]+$/)) {
                    console.log(`DEBUG: Jogo detectado em waitingForGames: ${msg.body}`);
                    chatState.data.jogos.push(msg.body.trim());
                    await msg.reply(`"${msg.body.trim()}" adicionado. Envie o próximo jogo ou !fim para terminar.`);
                    conversationState.set(senderNumber, chatState); // Atualiza o estado
                    return;
                } else {
                    console.log(`DEBUG: Formato de jogo inválido em waitingForGames.`);
                    await msg.reply('Formato de jogo inválido. Use `TIME1 X TIME2` ou `!fim` para finalizar.');
                    return;
                }
            }

        } else {
            console.log(`DEBUG: ${senderNumber} NÃO é um ADMIN.`);
        }


        // --- Common User Commands (accessible por todos, incluindo admins) ---

        // Comando !ping para testar se o bot está vivo
        if (lowerCaseBody === '!ping') {
            console.log(`DEBUG: Comando !ping detectado.`);
            await msg.reply('pong');
            return;
        }

        // Comando !bolões para listar bolões disponíveis
        if (lowerCaseBody === '!bolões' || lowerCaseBody === '!boloes') {
            console.log(`DEBUG: Comando !bolões detectado.`);
            if (Object.keys(bolaoData).length === 0) {
                await msg.reply('Nenhum bolão disponível no momento.');
                return;
            }
            let response = 'Bolões disponíveis:\n\n';
            for (const id in bolaoData) {
                response += `*ID:* ${bolaoData[id].id}\n`;
                response += `*Nome:* ${bolaoData[id].nome}\n`;
                response += `*Jogos:* ${bolaoData[id].jogos.length} \n`;
                response += `Para ver os jogos: !jogos ${bolaoData[id].id}\n\n`;
            }
            await msg.reply(response);
            return;
        }

        // Comando !jogos <ID_DO_BOLAO>
        if (lowerCaseBody.startsWith('!jogos ')) {
            console.log(`DEBUG: Comando !jogos detectado.`);
            const bolaoId = lowerCaseBody.substring('!jogos '.length).trim();
            const bolao = bolaoData[bolaoId];

            if (bolao) {
                let response = `Jogos do bolão "${bolao.nome}" (ID: ${bolao.id}):\n\n`;
                bolao.jogos.forEach((jogo, index) => {
                    response += `${index + 1}. ${jogo}\n`;
                });
                await msg.reply(response);
            } else {
                await msg.reply('Bolão não encontrado. Verifique o ID.');
            }
            return;
        }


        // Comando !palpite <ID_DO_BOLAO> <NUMERO_JOGO> <PLACAR1> <PLACAR2>
        // Ex: !palpite bolao-12345 1 2 1
        if (lowerCaseBody.startsWith('!palpite ')) {
            console.log(`DEBUG: Comando !palpite detectado.`);
            const args = lowerCaseBody.substring('!palpite '.length).trim().split(' ');
            if (args.length === 4) {
                const bolaoId = args[0];
                const numeroJogo = parseInt(args[1]);
                const placar1 = parseInt(args[2]);
                const placar2 = parseInt(args[3]);

                const bolao = bolaoData[bolaoId];

                if (bolao && !isNaN(numeroJogo) && numeroJogo > 0 && numeroJogo <= bolao.jogos.length &&
                    !isNaN(placar1) && !isNaN(placar2) && placar1 >= 0 && placar2 >= 0) {

                    const jogoIndex = numeroJogo - 1;
                    const jogo = bolao.jogos[jogoIndex];

                    // Formato do palpite: { sender: 'número', jogo: 'TIME1 X TIME2', placar: '2 X 1' }
                    if (!bolao.palpites) {
                        bolao.palpites = [];
                    }
                    // Verifica se o usuário já palpitou para este jogo neste bolão
                    const existingPalpiteIndex = bolao.palpites.findIndex(
                        p => p.sender === senderNumber && p.jogoIndex === jogoIndex
                    );

                    if (existingPalpiteIndex !== -1) {
                        // Atualiza o palpite existente
                        bolao.palpites[existingPalpiteIndex].placar = `${placar1} X ${placar2}`;
                        await msg.reply(`Seu palpite para o jogo "${jogo}" no bolão "${bolao.nome}" foi atualizado para *${placar1} X ${placar2}*.`);
                    } else {
                        // Adiciona um novo palpite
                        bolao.palpites.push({
                            sender: senderNumber,
                            jogoIndex: jogoIndex,
                            jogo: jogo,
                            placar: `${placar1} X ${placar2}`
                        });
                        await msg.reply(`Palpite para o jogo "${jogo}" no bolão "${bolao.nome}" salvo: *${placar1} X ${placar2}*.`);
                    }
                    saveBolaoData(); // Salvar dados após o palpite
                } else {
                    await msg.reply('Formato de palpite inválido ou bolão/jogo não encontrado. Use: `!palpite <ID_DO_BOLAO> <NUMERO_JOGO> <PLACAR1> <PLACAR2>`');
                }
            } else {
                await msg.reply('Formato de palpite inválido. Use: `!palpite <ID_DO_BOLAO> <NUMERO_JOGO> <PLACAR1> <PLACAR2>`');
            }
            return;
        }

        // Comando !meuspalpites <ID_DO_BOLAO>
        if (lowerCaseBody.startsWith('!meuspalpites ')) {
            console.log(`DEBUG: Comando !meuspalpites detectado.`);
            const bolaoId = lowerCaseBody.substring('!meuspalpites '.length).trim();
            const bolao = bolaoData[bolaoId];

            if (bolao && bolao.palpites && bolao.palpites.length > 0) {
                const meusPalpites = bolao.palpites.filter(p => p.sender === senderNumber);

                if (meusPalpites.length > 0) {
                    let response = `Seus palpites para o bolão "${bolao.nome}" (ID: ${bolao.id}):\n\n`;
                    meusPalpites.forEach(palpite => {
                        response += `*Jogo ${palpite.jogoIndex + 1}:* ${palpite.jogo} -> *${palpite.placar}*\n`;
                    });
                    await msg.reply(response);
                } else {
                    await msg.reply(`Você ainda não fez nenhum palpite para o bolão "${bolao.nome}".`);
                }
            } else {
                await msg.reply('Bolão não encontrado ou nenhum palpite registrado.');
            }
            return;
        }


        // Comando !ajuda
        if (lowerCaseBody === '!ajuda' || lowerCaseBody === '!help') {
            console.log(`DEBUG: Comando !ajuda detectado.`);
            let helpMessage = `Olá! Sou o Bot do Bolão. Aqui estão os comandos que você pode usar:\n\n` +
                               `*Comandos para todos:*\n` +
                               `!ping - Verifica se o bot está online.\n` +
                               `!bolões - Lista os bolões disponíveis.\n` +
                               `!jogos <ID_DO_BOLAO> - Mostra os jogos de um bolão específico.\n` +
                               `!palpite <ID_DO_BOLAO> <NUM_JOGO> <PL_TIME1> <PL_TIME2> - Salva seu palpite para um jogo.\n` +
                               `!meuspalpites <ID_DO_BOLAO> - Vê seus palpites para um bolão.\n\n`;

            if (ADMIN_NUMBERS.includes(senderNumber)) {
                helpMessage += `*Comandos de Administrador:*\n` +
                               `!setrodada - Inicia o processo de criação de uma nova rodada de jogos.\n` +
                               `!fim - Finaliza a entrada de jogos (após !setrodada).\n`;
            }
            await msg.reply(helpMessage);
            return;
        }

    } catch (error) {
        console.error('Erro ao processar mensagem:', error);
        await client.sendMessage(msg.from, 'Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente ou verifique o formato do comando.');
    }
});

// --- NOVO LOG DE DEPURAÇÃO ---
console.log('Inicializando cliente...');
client.initialize();
// --- NOVO LOG DE DEPURAÇÃO ---
console.log('client.initialize() chamado.');
>>>>>>> 9d3389df3f6853480b05cd58b730634461e7d509
