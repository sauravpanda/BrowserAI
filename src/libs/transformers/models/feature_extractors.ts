export * from './audio_spectrogram_transformer/feature_extraction_audio_spectrogram_transformer';
export * from './clap/feature_extraction_clap';
export * from './moonshine/feature_extraction_moonshine';
export * from './pyannote/feature_extraction_pyannote';
export * from './seamless_m4t/feature_extraction_seamless_m4t';
export * from './speecht5/feature_extraction_speecht5';
export * from './wav2vec2/feature_extraction_wav2vec2';
export * from './wespeaker/feature_extraction_wespeaker';
export * from './whisper/feature_extraction_whisper';

// For legacy support, ImageFeatureExtractor is an alias for ImageProcessor
export { ImageProcessor as ImageFeatureExtractor } from '../base/image_processors_utils';
