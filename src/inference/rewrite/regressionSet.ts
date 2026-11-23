// D-R6 regression set. Fact lists were written before any model call.
// People, places and dates are invented. n 17 is the film example.

export interface RegressionNote {
  n: number;
  note: string;
  facts: readonly (readonly string[])[];
}

export const REGRESSION_NOTES: readonly RegressionNote[] = [
  { n: 1, note: "[Person 1] missed the benefits form deadline last wk, letter on the table.", facts: [["missed", "benefits", "form", "deadline"], ["last", "week"], ["letter", "table"]] },
  { n: 2, note: "[Person 2] said the rent letter came Tue and the apt is cold.", facts: [["said|stated|told", "rent", "letter", "came|arrived", "tuesday"], ["apartment", "cold"]] },
  { n: 3, note: "Visit Mon 10am. [Person 3] left the doc on the chair. No reply from the mgr.", facts: [["visit", "monday", "10|ten"], ["left", "document", "chair"], ["no|not", "reply|answer|response", "manager"]] },
  { n: 4, note: "[Person 4] missed the appt last wk bc the bus did not come.", facts: [["missed", "appointment", "last", "week"], ["because", "bus", "not|didn't|didnt", "come|came"]] },
  { n: 5, note: "Boiler out since Fri. [Person 1] has had no hot water. Next visit Wed.", facts: [["boiler", "out|off", "friday"], ["no|not|lacks", "hot", "water"], ["next", "visit", "wednesday"]] },
  { n: 6, note: "[Person 2] asked for the benefits info form. Letter dated 12 Nov is on the table.", facts: [["asked|requested", "benefits", "information", "form"], ["letter", "dated", "12|twelve", "november"], ["table"]] },
  { n: 7, note: "[Place 1] kitchen damp near the window. [Person 3] will ring the mgr Mon.", facts: [["kitchen", "damp", "window"], ["will", "ring|call|phone", "manager", "monday"]] },
  { n: 8, note: "[Person 4] signed the form. The apt check is set for Thu at 3.", facts: [["signed", "form"], ["apartment", "check", "thursday", "3|three"]] },
  { n: 9, note: "Msg from [Person 1]: the doc was sent last wk and no answer yet.", facts: [["message"], ["document", "sent", "last", "week"], ["no|not", "answer|reply"]] },
  { n: 10, note: "[Person 2] was out. Card left at [Place 2]. Return visit Fri 9am.", facts: [["out|absent"], ["card", "left"], ["return", "visit", "friday", "9|nine"]] },
  { n: 11, note: "[Person 3] needs the yr form for benefits. The old one expired in May.", facts: [["needs|requires", "year", "form", "benefits"], ["expired", "may"]] },
  { n: 12, note: "Two letters on the table. [Person 4] missed both appts this mo.", facts: [["two|2", "letters", "table"], ["missed", "appointments", "month"]] },
  { n: 13, note: "[Person 1] agreed to bring the docs next Tue. The mgr visit is at 2.", facts: [["agreed", "bring", "documents", "tuesday"], ["manager", "visit", "2|two"]] },
  { n: 14, note: "Hall light out at [Place 1] since Sat. [Person 2] reported it last wk.", facts: [["hall|hallway", "light", "out|off|outage", "saturday"], ["reported", "last", "week"]] },
  { n: 15, note: "[Person 3] has a benefits appt Mon. The letter says bring the id doc.", facts: [["benefits", "appointment", "monday"], ["letter", "bring", "identification", "document"]] },
  { n: 16, note: "Rent is late by 2 wks. [Person 4] left a msg for the mgr.", facts: [["rent", "late", "2|two", "weeks"], ["left|messaged", "message", "manager"]] },
  { n: 17, note: "[Person 1] said the apt lock sticks. The bldg office is closed Fri.", facts: [["said|stated|told|reported", "apartment", "lock", "sticks|stuck"], ["building", "office", "closed", "friday"]] },
  { n: 18, note: "Next visit [Place 2] on Wed. [Person 2] will have the form ready.", facts: [["next", "visit", "wednesday"], ["will", "form", "ready"]] },
  { n: 19, note: "[Person 3] did not get the info letter. A copy goes out this wk.", facts: [["not", "get|receive", "information", "letter"], ["copy", "week"]] },
  { n: 20, note: "[Person 4] asked about the mo payment. The form is due Fri.", facts: [["asked|requested|inquired", "month|monthly", "payment"], ["form", "due", "friday"]] },
  { n: 21, note: "F/u with [Person 1] on the apt leak. The bldg office asked for a call Fri.", facts: [["follow-up", "apartment", "leak"], ["building", "office", "asked", "call", "friday"]] },
  { n: 22, note: "[Person 2] brought the id docs to the appt. The mgr signed them Tue.", facts: [["brought", "identification", "documents", "appointment"], ["manager", "signed", "tuesday"]] },
  { n: 23, note: "Msg left for [Person 3] about the yr form. Return visit at [Place 1] on Thu.", facts: [["message", "left", "year", "form"], ["return", "visit", "thursday"]] },
  { n: 24, note: "[Person 4] paid the mo rent. The letter is dated 3 Nov.", facts: [["paid", "month", "rent"], ["letter", "dated", "3", "november"]] },
  { n: 25, note: "Two appts missed at [Place 2]. [Person 1] said the bus was late Mon.", facts: [["two", "appointments", "missed"], ["said", "bus", "late", "monday"]] },
  { n: 26, note: "The doc for [Person 2] is due in 1 wk. Info is in the apt file.", facts: [["document", "due", "1", "week"], ["information", "apartment", "file"]] },
  { n: 27, note: "[Person 3] has no hot water since Sat. Next f/u is Wed at 4.", facts: [["no", "hot", "water", "saturday"], ["next", "follow-up", "wednesday", "4"]] },
  { n: 28, note: "Hall at [Place 1] is damp. [Person 4] will bring the docs Fri.", facts: [["hall", "damp"], ["will", "bring", "documents", "friday"]] },
  { n: 29, note: "[Person 1] left a msg bc the apt door sticks. Visit [Place 2] on Tue.", facts: [["left", "message", "because", "apartment", "door", "sticks"], ["visit", "tuesday"]] },
  { n: 30, note: "Benefits appt for [Person 2] is Mon at 11. Bring the id and the yr form.", facts: [["benefits", "appointment", "monday", "11"], ["bring", "identification", "year", "form"]] },
];

export const FILM_NOTE = 17;
