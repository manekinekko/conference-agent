process.env.DEBUG = 'actions-on-google:*';

const fs = require('fs');
const util = require('util');

const ApiAiAssistant = require('actions-on-google').ApiAiAssistant;
const fetch = require('node-fetch');
const async = require('asyncawait/async');
const await = require('asyncawait/await');

// intents
const LIST_TOPICS_INTENT = 'list-topics';

const _fetchSchedule = async(() => {
    let schedules = ['thursday', 'friday'].map(day => {
        const rawResponse = await (fetch(`http://cfp.devoxx.co.uk/api/conferences/DV17/schedules/${day}`));
        const response = await (rawResponse.text());
        return JSON.parse(response);
    }).map(d => d.slots);

    return [].concat(
        ...schedules
    );
});

const filter = (schedule, predicat) => {
    return predicat(schedule);
};

const byTalkName = (schedule) => {
    return schedule
        .filter(s => s.talk)
        .map(s => s.talk.title.trim());
};

const byTalkType = (schedule) => {
    schedule = schedule
        .filter(s => s.talk)
        .map(s => s.talk.talkType.trim());
    return [
        ...new Set(schedule)
    ];
};

const byRoom = (schedule) => {
    schedule = schedule
        .filter(s => s.talk)
        .map(s => s.roomName.trim());
    return [
        ...new Set(schedule)
    ];
};

const bySpeaker = (schedule) => {
    return [
        ...new Set(
            schedule
            .filter(s => s.talk)
            .map(s => s.talk.speakers.map(s => s.name.trim()).pop())
            .sort()
        )
    ];
};

const listTopicsIntent = (assistant) => {
    // const schedule = await (_fetchSchedule());
    // const topics = filter(schedule, byTalkType);
    // console.log(topics);
    assistant.ask(`The topics covered are: . 
                    What do you want to learn about?'`);
};

exports.devoxx = (request, response) => {
    fs.writeFileSync('./request.json', util.inspect(request, false, 5));
    let assistant = new ApiAiAssistant({ request, response });
    let actionMap = new Map();
    actionMap.set(LIST_TOPICS_INTENT, (assistant) => {
        assistant.ask(`The topics covered are: . 
                    What do you want to learn about?'`);
    });
    assistant.handleRequest(actionMap);
    fs.writeFileSync('./response.json', util.inspect(request, false, 5));
};