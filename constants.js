const TargetLanguage = {
  English: 'English',
  Hindi: 'Hindi',
  Bengali: 'Bengali',
  Telugu: 'Telugu',
  Marathi: 'Marathi',
  Tamil: 'Tamil',
  Gujarati: 'Gujarati',
  Kannada: 'Kannada',
  Odia: 'Odia',
  Malayalam: 'Malayalam',
  Punjabi: 'Punjabi',
  Nepali: 'Nepali',
  Spanish: 'Spanish',
  Assamese: 'Assamese',
  Other: 'Other',
};

const LANGUAGES = [
  { value: TargetLanguage.Hindi, label: 'Hindi (हिंदी)' },
  { value: TargetLanguage.English, label: 'English' },
  { value: TargetLanguage.Spanish, label: 'Spanish (Español)' },
  { value: TargetLanguage.Bengali, label: 'Bengali (বাংলা)' },
  { value: TargetLanguage.Telugu, label: 'Telugu (తెలుగు)' },
  { value: TargetLanguage.Marathi, label: 'Marathi (मराठी)' },
  { value: TargetLanguage.Tamil, label: 'Tamil (தமிழ்)' },
  { value: TargetLanguage.Gujarati, label: 'Gujarati (ગુજરાતી)' },
  { value: TargetLanguage.Kannada, label: 'Kannada (కన్నడ)' },
  { value: TargetLanguage.Odia, label: 'Odia (ଓڈ଼ିଆ)' },
  { value: TargetLanguage.Malayalam, label: 'Malayalam (മലയാളം)' },
  { value: TargetLanguage.Punjabi, label: 'Punjabi (ਪੰਜਾਬੀ)' },
  { value: TargetLanguage.Nepali, label: 'Nepali (नेपाली)' },
  { value: TargetLanguage.Other, label: 'Other (Custom)' },
];

module.exports = { LANGUAGES, TargetLanguage };
