#define PIN_ENA 8
#define PIN_STP 2
#define PIN_DIR 5
#define PIN_SWT 9

void setup() {
  pinMode(PIN_ENA, OUTPUT);
  pinMode(PIN_STP, OUTPUT);
  pinMode(PIN_DIR, OUTPUT);
  pinMode(PIN_SWT, INPUT_PULLUP);

  Serial.begin(115200);
}

void loop() {
  char cmd = Serial.read();
  // Active low input switch
  bool hit = !digitalRead(PIN_SWT);

  switch(cmd) {
    case 'D':
      digitalWrite(PIN_ENA, HIGH);
      break;
    case 'E':
      digitalWrite(PIN_ENA, LOW);
      break;
    case 'S':
      // Minimum time for A4988 is 1us
      digitalWrite(PIN_STP, HIGH);
      delayMicroseconds(2);
      digitalWrite(PIN_STP, LOW);
      delayMicroseconds(2);
      break;
    case 'F':
      digitalWrite(PIN_DIR, LOW);
      break;
    case 'B':
      digitalWrite(PIN_DIR, HIGH);
      break;
    case -1:
      delayMicroseconds(1);
    default:
      if (hit) {
        Serial.write('X');
      } else {
        Serial.write('x');
      }
      return;
  }

  if (hit) {
    Serial.write('K');
  } else {
    Serial.write('k');
  }
}
