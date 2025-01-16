import { GITHUB_ISSUE_URL, IMAGE_PROCESSOR_NAME } from '../../utils/constants';
import { getModelJSON } from '../../utils/hub';
import { ImageProcessor } from '../../base/image_processors_utils';
import * as AllImageProcessors from '../image_processors';

export class AutoImageProcessor {

    /** @type {typeof ImageProcessor.from_pretrained} */
    static async from_pretrained(pretrained_model_name_or_path: string, options: Record<string, unknown> = {}) {

        const preprocessorConfig = await getModelJSON(pretrained_model_name_or_path, IMAGE_PROCESSOR_NAME, true, options);

        // Determine image processor class
        const key = preprocessorConfig.image_processor_type ?? preprocessorConfig.feature_extractor_type;
        let image_processor_class: typeof AllImageProcessors;

        if (key !== undefined) {
            // Only log a warning if the class is not found and the key is set.
            console.warn(`Image processor type '${key}' not found, assuming base ImageProcessor. Please report this at ${GITHUB_ISSUE_URL}.`)
        }
        image_processor_class = ImageProcessor;

        // Instantiate image processor
        return new image_processor_class(preprocessorConfig);
    }
}
