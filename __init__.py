from .nodes import DavchaEditorExtension

WEB_DIRECTORY = './web'


async def comfy_entrypoint() -> DavchaEditorExtension:
    return DavchaEditorExtension()
