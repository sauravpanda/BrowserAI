import { GITHUB_ISSUE_URL, IMAGE_PROCESSOR_NAME } from '../../utils/constants';
import { getModelJSON } from '../../utils/hub';
import { ImageProcessor } from '../../base/image_processors_utils';
import { VLMImageProcessor } from '../janus/image_processing_janus';

// Map of processor types to their implementations
const PROCESSOR_MAPPING = {
  'VLMImageProcessor': VLMImageProcessor,
  'ImageProcessor': ImageProcessor,
};

export class AutoImageProcessor {
  /** @type {typeof ImageProcessor.from_pretrained} */
  static async from_pretrained(pretrained_model_name_or_path: string, options: Record<string, unknown> = {}) {
    const preprocessorConfig = await getModelJSON(pretrained_model_name_or_path, IMAGE_PROCESSOR_NAME, true, options);

    // Determine image processor class
    const key = preprocessorConfig.image_processor_type ?? preprocessorConfig.feature_extractor_type;
    let image_processor_class = ImageProcessor;

    if (key && key in PROCESSOR_MAPPING) {
      image_processor_class = PROCESSOR_MAPPING[key as keyof typeof PROCESSOR_MAPPING];
    } else if (key !== undefined) {
      console.warn(
        `Image processor type '${key}' not found, assuming base ImageProcessor. Please report this at ${GITHUB_ISSUE_URL}.`
      );
    }

    // Instantiate image processor
    return new image_processor_class(preprocessorConfig);
  }
}
