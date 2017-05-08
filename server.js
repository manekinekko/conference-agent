const ApiAiAssistant = require('actions-on-google').ApiAiAssistant;
const fetch = require('node-fetch');

const FIND_BY_TOPIC_INTENT = 'find-by-topic';
const LIST_TOPICS_INTENT = 'list-topics';
const FIND_BY_TIME_INTENT = 'find-by-time';
const FIND_BY_TOPIC_MORE_INTENT = 'find-by-topic-more';
const FIND_BY_TOPIC_NEXT_INTENT = 'find-by-topic-next';
const FIND_BY_TOPIC_OR_MORE_CONTEXT = 'find-by-topic-more-next';
const TOPIC = 'topic';

function findByTopicMoreIntent(assistant) {
    console.log("findByTopicMoreIntent");
    let contexts = assistant.getContexts();
    let context = contexts.filter(value => value.name === FIND_BY_TOPIC_OR_MORE_CONTEXT)[0];
    let sessionIndex = context.parameters.sessionIndex;
    let talkIds = context.parameters.talkIds;
    let currentTalkId = talkIds[sessionIndex];

    findTalkById(currentTalkId)
        .then(talk => {
            console.log('sessionIndex: ' + sessionIndex + ', title: ' + talk.session_name);

            // let time = `${talk.start_hour}:${talk.start_min}`;
            let time = (talk.start_hour % 12) + ':' + talk.start_min +
                (talk.start_hour < 12 ? 'AM' : 'PM');

            assistant.ask(`Sure, here is more information! 
                   The presentation starts at ${time}, 
                   in ${talk.room} at ${talk.building}. 
                   The abstract says: ${talk.description}. 
                   Would you like to hear about the next session?`);
        })
        .catch(err => {
            console.log(`Error fetching talk by id: ${err}`);
        });
}

function findByTopicNextIntent(assistant) {
    console.log("findByTopicNextIntent");
    let contexts = assistant.getContexts();
    let context = contexts.filter(value => value.name === FIND_BY_TOPIC_OR_MORE_CONTEXT)[0];
    let sessionIndex = context.parameters.sessionIndex + 1;
    let totalSessions = context.parameters.totalSessions;
    let talkIds = context.parameters.talkIds;
    let currentTalkId = talkIds[sessionIndex];
    console.log(`session_index: ${sessionIndex} out of ${totalSessions} (${talkIds.join(', ')})`);

    assistant.setContext('find-by-topic-more-next', 3, {sessionIndex, talkIds, totalSessions});

    if (sessionIndex < totalSessions) {
        findTalkById(currentTalkId).then(talk =>
            assistant.ask(`Sure, the next session is ${talk.session_name}.
                       Would you like to hear more about it 
                       ${sessionIndex < totalSessions ? " or about the next session" : ""}?`)
        );
    } else {
        assistant.ask(`Sorry, there's no more session on that topic. 
                       Are you interested in other topics?`)
    }
}

function findByTopicIntent(assistant) {
    console.log("findByTopicIntent");
    let topic = assistant.getArgument(TOPIC);
    topic = topic.toLowerCase().replace('and ', '& ');
    console.log(`Topic = ${topic}`);

    if (topic === '') {
        assistant.ask(`Sorry, I didn't get what topic you were interested in. 
                       Is there another topic you'd like to hear about?`);
    } else {
        fetch('https://cloudnext.withgoogle.com/api/v1/sessions')
            .then(response => response.text())
            .then(text => {
                // console.log(`findByTopic fetch text = ${text}`);

                let parsed = JSON.parse(text.split('\n')[1]);
                let talks = parsed.sessions.filter(ses =>
                    ses.category_names.some(catName => catName.toLowerCase() === topic));
                console.log(`${talks.length} talks found for topic: ${topic}`);

                if (talks.length === 0) {
                    assistant.ask(`Sorry, I couldn't find any session about ${topic}.
                                   Is there another topic you'd be interested in?`);
                } else {
                    assistant.setContext('find-by-topic-more-next', 3, {
                        sessionIndex: 0,
                        talkIds: talks.map(talk => talk.session_id),
                        totalSessions: talks.length
                    });
                    assistant.ask(`The next session about ${topic} is called ${talks[0].session_name}.
                                   Would you like to hear more about it or hear about the next session?`);
                }
            })
            .catch(err => {
                console.log(`Error while fetching sessions: ${err}`);

                assistant.tell(`I wasn't able to reach the Cloud Next REST API 
                                to list the available sessions about ${topic}.`);
            });
    }
}

function findTalkById(sessionId) {
    console.log(`findTalkById ${sessionId}`);
    return fetch(`https://cloudnext.withgoogle.com/api/v1/sessions/${sessionId}`)
        .then(response => response.text())
        .then(text => {
            // console.log(`findTalkById fetch text = ${text}`);
            return JSON.parse(text.split('\n')[1]);
        });
}

function listTopicsIntent(assistant) {
    console.log("listTopicsIntent");

    fetch('https://cloudnext.withgoogle.com/api/v1/categories')
        .then(response => response.text())
        .then(text => {
            let data = JSON.parse(text.split('\n')[1]);
            let topics = data.categories
                .filter(cat => cat.name === "Topics" || cat.name === "Track")
                .map(cat => cat.children.map(child => child.name).join(', '))
                .join(', ');
            console.log(topics);

            assistant.ask(`The topics covered are: ${topics}. 
                           What do you want to learn about?'`);
        });
}

exports.agent2 = function (request, response) {
    console.log("start");

    let assistant = new ApiAiAssistant({request, response});
    let actionMap = new Map();

    actionMap.set(FIND_BY_TOPIC_NEXT_INTENT, findByTopicNextIntent);
    actionMap.set(FIND_BY_TOPIC_MORE_INTENT, findByTopicMoreIntent);
    actionMap.set(FIND_BY_TOPIC_INTENT, findByTopicIntent);
    actionMap.set(LIST_TOPICS_INTENT, listTopicsIntent);

    assistant.handleRequest(actionMap);
};
