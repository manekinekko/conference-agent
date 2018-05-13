'use strict';

// ///////////////////////// IMPORT /////////////////////////
const functions = require('firebase-functions');
const DialogflowApp = require('actions-on-google').DialogflowApp;
const f = require('node-fetch');
// ///////////////////////// SERVICES /////////////////////////
Object._values = x => Object.keys(x).map(k => x[k]);
const SESSION = `https://ngvikings-81b48.firebaseio.com/sessions.json`;
const SPEAKERS = `https://ngvikings-81b48.firebaseio.com/speakers.json`;
const SCHEDULE = `https://ngvikings-81b48.firebaseio.com/schedule.json`;
const json = x => x.json();
const api = x =>
  f(x)
    .then(json)
    .catch(console.error);
const getSessions = () => api(SESSION);
const getSchedule = () => api(SCHEDULE);
const getSpeakers = () => api(SPEAKERS);
const getSpeakersByTopic = topic => {
  const r = new RegExp(topic, 'i');
  return getSessions()
    .then(sessions => Object._values(sessions))
    .then(sessions => sessions.filter(session => session.speakers && [session.title, session.description].join(' ').match(r)))
    .then(sessionByTopic => {
      return getSpeakers().then(speakers => {
        return sessionByTopic.map(session => {
          return {
            speaker: speakers[session.speakers[0]],
            session
          };
        });
      });
    });
};
const getScheduleByTalk = talkId => {
  const search = (timeslots, id) => {
    return timeslots.filter(ts => !!ts.sessions.filter(session => session.items.pop() === id).pop()).pop();
  };

  return getSchedule().then(schedule => {
    const day2 = schedule.pop();
    const day1 = schedule.pop();
    const workshop = schedule.pop();
    let d = day2;
    let s = search(day2.timeslots, talkId);

    if (!s) {
      s = search(day1.timeslots, talkId);
      d = day1;
    }
    if (!s) {
      s = search(workshop.timeslots, talkId);
      d = workshop;
    }

    return { s, d };
  });
};
// ///////////////////////// LOGIC /////////////////////////
function countSpeakers(app) {
  getSpeakers()
    .then(speakers => app.tell(`I found ${speakers.length} speakers.`))
    .catch(error => app.tell(`I encountered an error while fetching the data. Please check the network setting.`));
}
function findByTopic(app) {
  const topic = app.getArgument('topic');
  getSpeakersByTopic(topic)
    .then(data => {
      if (data.length === 0) {
        app.tell(`No one is talking about ${topic}. Try another topic name.`);
      } else if (data.length === 1) {
        const talk = data.pop();
        app.data.talk = talk;
        app.ask(
          `${talk.speaker.name} is talking about ${topic}. The title is "${talk.session.title}". Do you wanna hear more about this talk?`
        );
      } else {
        app.tell(`I found ${data.length} speakers who are presenting about ${topic}. Try narrowing your topic to get different results.`);
      }
    })
    .catch(error => app.tell(`I encountered an error while fetching the data. ${error}`));
}
function talkDetails(app) {
  const talk = app.data.talk;
  getScheduleByTalk(+talk.session.id).then(schedule => {
    app.tell(
      `This talk will start at ${schedule.s.startTime} on ${schedule.d.dateReadable}. Here the description: "${talk.session.description}"`
    );
  });
}
// //////////////////// CLOUD FUNCTION ////////////////////
exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
  const app = new DialogflowApp({ request, response });
  const actions = new Map();

  actions.set('conferences.ngvikings.speakers.count', countSpeakers);
  actions.set('conferences.ngvikings.speakers.topic', findByTopic);
  actions.set('conferences.ngvikings.speakers.topic.more', talkDetails);

  app.handleRequest(actions);
});
