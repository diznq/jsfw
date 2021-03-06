const fw = new FW()

const messagingService = {
    messages: {
        "1": [
            {
                text: "Hi!",
                fromMe: true,
                sent: true
            },
            {
                text: "Hey!",
                fromMe: false,
                sent: true
            },
        ]
    },

    async getMessages(chat){
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve(JSON.parse(JSON.stringify(this.messages[chat.id])))
            }, 500)
        })
    }
}

const state = fw.addState({
    chats: [
        {
            id: "1",
            name: "Jane Smith",
            lastMessage: {
                text: "Hey!",
                fromMe: false
            }
        }
    ],
    activeChat: {
        open: false,
        name: "",
        messages: []
    }
})

async function openChat(chat){
    const messages = await messagingService.getMessages(chat)
    state.activeChat = {
        open: true,
        name: chat.name,
        messages: messages
    }
}

function init(){
    const elements = document.querySelectorAll("[fw]")
    elements.forEach(element => fw.bootstrap(state, element))
}
window.onload = () => init()
