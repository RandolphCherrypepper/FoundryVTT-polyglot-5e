const DEBUG = true;
function pg_debug(funcname,...args) {
    if (!DEBUG) return;
    console.log("polyglot | DEBUG: ", funcname, ...args);
}

// Find a numerical hash/checksum value for the given text.
function hashCode(text) {
    pg_debug("hashCode", text);
    // modified from https://stackoverflow.com/a/7616484
    var hash = 0,
        i, chr;
    if (text.length === 0) return hash;
    for (i = 0; i < text.length; i++) {
        chr = text.charCodeAt(i);
        hash = ((hash << 5) - hash) + chr;
        hash |= 0; // Convert to 32bit integer
    }
    return hash + 2 ** 32;
}

// Given the name of a language, return the language's unique symbol.
// use this symbol to identify the language's idiosyncracies.
// you might not know what language is spoken, but it might sound familiar.
// this symbol represents "sound familiar". you might even learn to recognize
// which language is spoken, even if you can't understand it.
function languageSymbol(language) {
    pg_debug("languageSymbol", language);
    // convert the hash value into a string of hexadecimal values
    let lang_hex = hashCode(language).toString(16);
    // use symbols from the Dingbats block of UTF-8
    // find the symbol using the lowest 2 bytes of the hash code.
    let symbol = String.fromCharCode(0x2660 + parseInt(lang_hex.slice(-2), 16));
    pg_debug("languageSymbol", "symbol", symbpl);
    // the next 3 lowest bytes are used to determine the color.
    let color = lang_hex.slice(-5, -2);
    pg_debug("languageSymbol", "color", color);
    // since this is dynamic, CSS wouldn't work well. hard code color using a span.
    pg_debug("languageSymbol", `<span style="color:#${color};">${symbol}</span>`);
    return `<span style="color:#${color};">${symbol}</span>`;
}

function languageRepresentation(language, known) {
    pg_debug("languageRepresentation", language, known);
    if (known) {
        return languageSymbol(language) + " " + language;
    } else {
        pg_debug("languageRepresentation", "unknown:", game.i18n.localize("polyglot.!lang"));
        return languageSymbol(language) + game.i18n.localize("polyglot.!lang");
    }    
}

function getCurrentLanguages() {
    pg_debug("getCurrentLanguages");
    // Find the currently selected actor's id.
    let actor_id = ChatMessage.implementation.getSpeaker()?.actor;
    pg_debug("getCurrentLanguages","actor_id",actor_id);
    if (!actor_id) {
        // no chosen token? return a negative number
        pg_debug("getCurrentLanguages", "!actor", game.i18n.localize("polyglot.!actor"));
        throw new Error({ code: 1, reason: game.i18n.localize("polyglot.!actor") });
    } else {
        let languages = game.actors.get(actor_id)?.system?.traits?.languages?.value;
        pg_debug("getCurrentLanguages", "languages", languages);
        if (!languages) {
            pg_debug("getCurrentLanguages", "!langs", game.i18n.localize("polyglot.!langs"));
            throw new Error({ code: 2, reason: game.i18n.localize("polyglot.!langs") });
        }
        return languages;
    }
}

const empty_message = "...";

// This is where we send messages with language metadata.
function speakLanguage(language, message) {
    pg_debug("speakLanguage", language, message);
    // We'll use this to push messages as if they went through the regular chat box.
    let cmi = ChatMessage.implementation;

    // determine the currently selected actor.
    let speaker = cmi.getSpeaker();
    pg_debug("speakLanguage", "speaker", speaker);
    if (!speaker.actor) {
        pg_debug("speakLanguage", "!actor", game.i18n.localize("polyglot.!actor"));
        throw new Error(game.i18n.localize("polyglot.!actor"));
    }

    // TODO one could choose to verify the speaker can speak that language...

    // build chatData for the client-server API
    let chatData = {
        // this identifies the player doing this action
        user: game.user.id,
        // show nothing of interest
        content: empty_message,
        // in character speech
        type: CONST.CHAT_MESSAGE_TYPES.IC,
        // identify the character speaking the message
        speaker: speaker,
        // this is a hidden area that is mostly unused.
        // cram our secret message and language in here.
        flags: {
            polyglot: {
                language: language,
                content: message,
            }
        },
    };
    // this apparently isn't used for in character text?
    let createOptions = {};
    // this makes the magic happen, causes APIs to do internetting.
    pg_debug("speakLanguage", "chatData", chatData);
    return cmi.create(chatData, createOptions);
}

// once game data is available, hook into the UI
Hooks.once("ready", _ => {
    console.log("polyglot | Initializing polyglot.");

    // This is how we choose what language to speak.
    Hooks.on("renderSidebarTab", async (app, html, data) => {
        pg_debug("renderSidebarTab", app, html, data);
        // only operate on the actual chat bar
        if (app.tabName !== "chat") return;

        // determine current actor's spoken languages.
        let languages = null;
        try {
            languages = getCurrentLanguages();
        } catch (err) {
            // no way to inject languages, don't try.
            pg_debug("renderSidebarTab", "no languages, bail");
            return;
        }
        // convert languages to an array.
        languages = languages.toObject();
        pg_debug("renderSidebarTab", "languages", languages);
        // pop off the first language as the default selection.
        let default_language = languages.shift();
        pg_debug("renderSidebarTab", "default_language", default_language);
        pg_debug("renderSidebarTab", "languages", languages);

        // generate the language drop-down and button.
        let $content = $(await renderTemplate("modules/plotglot/templates/polyglot.html", { default_language, languages }));
        pg_debug("renderSidebarTab", "content", $content);
        // add the speech options under the chat box.
        let $chat_form = html.find("#chat-form");
        pg_debug("renderSidebarTab", "chat-form", $chat - form);
        $chat_form.after($content);
        // connect the speak button.
        $content.find("#polyglotSpeak").on("click", e => {
            pg_debug("#polyglotSpeak click", e);
            // make sure no other click handlers for this button activate.
            event.preventDefault();
            pg_debug("#polyglotSpeak click", "#polyglotLanguageChosen", $content.find('#polyglotLanguageChosen'));
            let language = $content.find('#polyglotLanguageChosen')[0].value;
            pg_debug("renderSidebarTab", "language", language);
            pg_debug("#polyglotSpeak click", "#chat-message", html.find("#chat-message"));
            let chatbox = html.find("#chat-message")[0];
            pg_debug("renderSidebarTab", "chatbox", chatbox);
            let message = chatbox.value;
            pg_debug("renderSidebarTab", "message", message);
            await speakLanguage(language, message);
            // message was successfully sent. clear the box.
            chatbox.value = "";
        });
    });

    // Re-render chat messages that use polyglot based on current token's language ability.
    // This is where you "understand the language".
    Hooks.on("renderChatMessage", (message, html) => {
        pg_debug("renderChatMessage", message, html);
        // only consider in character messages.
        if (message.type !== CONST.CHAT_MESSAGE_TYPES.IC) return;

        // extract polyglot data hidden in the message's flags.
        let polyglot_data = message.flags.polyglot;
        pg_debug("renderChatMessage", "polyglot_data", polyglot_data);
        if (!polyglot_data) return;

        // the language used to convey the message
        let target_language = polyglot_data.language;

        // check if the current user is an admin. they'll read all languages
        // if not acting as another token.
        let is_admin = (game.user?.isGM || game.data.isAdmin);
        pg_debug("renderChatMessage", "is_admin", is_admin);

        // determine current actor's spoken languages.
        let languages = null;
        let can_speak_language = null;
        try {
            languages = getCurrentLanguages();
        } catch (err) {
            if (err.code > 0) {
                // something went wrong finding the language.
                // so the player cannot currently understand the language.
                can_speak_language = false;
            } else {
                // don't know what it was. chuck it higher.
                throw err;
            }
        }

        pg_debug("renderChatMessage", "can_speak_language early", can_speak_language);
        // check to see if the language can be spoken.
        if (can_speak_language === null && languages.has(target_language)) {
            // can_speak_language wasn't already set to false, AND
            // the actor can speak the language
            can_speak_language = true;
        } else {
            can_speak_language = false;
        }

        // Get the language's symbol and either name or some note that it isn't understood.
        let language_repr = languageRepresentation(target_language, can_speak_language);

        // Note the language (perhaps not precisely)
        message.flavor += " " + language_repr;
        if (can_speak_language) {
            // understands the language!
            message.content = polyglot_data.content;
        } else {
            if (is_admin) {
                // make sure the admin can actually see the message, but the current actor doesn't know it.
                message.flavor += "(" + game.actors.get(actor_id)?.name + game.i18n.localize("polyglot.admin!lang") + target_language + ")";
                message.content = polyglot_data.content;
            } else {
                // does not understand the language!
                message.content = empty_message; // this is redundant but a good precaution.
            }
        }
        pg_debug("renderChatMessage", "message", message);
        pg_debug("renderChatMessage", "message_html", message.getHTML());

        // replace the HTML element content with a new rendering of the ChatMessage we modified.
        message.getHTML().then(message_dom => html[0].innerHTML = message_dom[0].innerHTML);
    });
})